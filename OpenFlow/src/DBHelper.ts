import { Crypt } from "./Crypt";
import { User, Role, Rolemember, WellknownIds, Rights, NoderedUtil, Base, TokenUser, WorkitemQueue, Resource, ResourceUsage } from "@openiap/openflow-api";
import { Config } from "./Config";
import { Span } from "@opentelemetry/api";
import { Observable } from '@opentelemetry/api-metrics';
import { Logger } from "./Logger";
import { Auth } from "./Auth";
import { WebSocketServerClient } from "./WebSocketServerClient";
import { LoginProvider, Provider } from "./LoginProvider";
import * as cacheManager from "cache-manager";
import { TokenRequest } from "./TokenRequest";
import { amqpwrapper } from "./amqpwrapper";
// var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-ioredis');
var mongoStore = require('@skadefro/cache-manager-mongodb');

export class DBHelper {

    public memoryCache: any;
    public mongoCache: any;
    public async init() {
        if (!NoderedUtil.IsNullUndefinded(this.memoryCache)) return;

        this.mongoCache = cacheManager.caching({
            store: mongoStore,
            uri: Config.mongodb_url,
            options: {
                collection: "_cache",
                compression: false,
                poolSize: 5
            }
        });

        if (Config.cache_store_type == "mongodb") {
            this.memoryCache = this.mongoCache;
            this.ensureotel();
            return;
        } else if (Config.cache_store_type == "redis") {
            this.memoryCache = cacheManager.caching({
                store: redisStore,
                host: Config.cache_store_redis_host,
                port: Config.cache_store_redis_port,
                password: Config.cache_store_redis_password,
                ignoreCacheErrors: true,
                db: 0,
                ttl: Config.cache_store_ttl_seconds,
                max: Config.cache_store_max
            })
            // listen for redis connection error event
            var redisClient = this.memoryCache.store.getClient();
            redisClient.on('error', (error) => {
                Logger.instanse.error(error);
            });

            this.ensureotel();
            return;
        }
        this.memoryCache = cacheManager.caching({
            store: 'memory',
            ignoreCacheErrors: true,
            max: Config.cache_store_max,
            ttl: Config.cache_store_ttl_seconds
        });
        this.ensureotel();
    }
    public async clearCache(reason: string) {
        await this.init();
        var keys: string[];
        if (Config.cache_store_type == "redis") {
            keys = await this.memoryCache.keys('*');
        } else {
            keys = await this.memoryCache.keys();
        }
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] && !keys[i].startsWith("requesttoken")) {
                this.memoryCache.del(keys[i]);
            }
        }
        Logger.instanse.debug("clearCache called with reason: " + reason);
    }
    public async DeleteKey(key) {
        await this.init();
        Logger.instanse.debug("Remove from cache : " + key);
        await this.memoryCache.del(key);
    }
    public item_cache: Observable = null;
    public ensureotel() {
        if (!NoderedUtil.IsNullUndefinded(Logger.otel) && !NoderedUtil.IsNullUndefinded(Logger.otel.meter) && NoderedUtil.IsNullUndefinded(this.item_cache)) {
            this.item_cache = Logger.otel.meter.createObservableGauge("openflow_item_cache_count", {
                description: 'Total number of cached items'
            });
            this.item_cache?.addCallback(async (res) => {
                var keys: any = null;
                try {
                    if (Config.cache_store_type == "redis") {
                        keys = await this.memoryCache.keys('*');
                    } else {
                        keys = await this.memoryCache.keys();
                    }
                } catch (error) {

                }
                if (keys != null) {
                    res.observe(keys.length, { ...Logger.otel.defaultlabels, type: Config.cache_store_type })
                } else {
                    res.observe(0, { ...Logger.otel.defaultlabels, type: Config.cache_store_type })
                }
            })
        }
    }
    async FindByIdWrap(_id, span) {
        Logger.instanse.debug("Add user to cache : " + _id);
        return Config.db.getbyid<User>(_id, "users", Crypt.rootToken(), true, span);
    }
    public async FindById(_id: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(_id)) return null;
            var key = ("users_" + _id).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindByIdWrap(_id, span) });
            this.ensureotel();
            if (NoderedUtil.IsNullUndefinded(item)) {
                Logger.instanse.debug("No user matches " + _id);
                return null;
            }
            Logger.instanse.silly("Return user " + _id + " " + item.formvalidated);
            var res2 = await this.DecorateWithRoles(User.assign<User>(item), span);
            return res2;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public GetResourcesWrap(span) {
        Logger.instanse.debug("Add resources user to cache");
        return Config.db.query<Resource>({ query: { "_type": "resource" }, collectionname: "config", jwt: Crypt.rootToken() }, span);
    }
    public async GetResources(parent: Span): Promise<Resource[]> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetResources", parent);
        try {
            let items = await this.memoryCache.wrap("resource", () => { return this.GetResourcesWrap(span) });
            Logger.instanse.silly("Return " + items.length + " resources");
            return items;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public GetResourceUsageByUserIDWrap(userid, span) {
        Logger.instanse.debug("Add user resources to cache : " + userid);
        return Config.db.query<ResourceUsage>({ query: { "_type": "resourceusage", userid }, collectionname: "config", jwt: Crypt.rootToken() }, span);
    }
    public async GetResourceUsageByUserID(userid: string, parent: Span): Promise<ResourceUsage[]> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetResourceUsageByUserID", parent);
        try {
            var key = ("resourceusage_" + userid).toString().toLowerCase();
            let items = await this.memoryCache.wrap(key, () => { return this.GetResourceUsageByUserIDWrap(userid, span) });
            Logger.instanse.silly("Return resources for user " + userid);
            return items;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public GetProvidersWrap(span) {
        return Config.db.query<Provider>({ query: { _type: "provider" }, top: 10, collectionname: "config", jwt: Crypt.rootToken() }, span);
    }
    public async GetProviders(parent: Span): Promise<Provider[]> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetProviders", parent);
        try {
            let items = await this.memoryCache.wrap("providers", () => { return this.GetProvidersWrap(span) });
            // const result: Provider[] = [];
            // https://www.w3schools.com/icons/fontawesome5_icons_brands.asp
            items.forEach(provider => {
                // const item: any = { name: provider.name, id: provider.id, provider: provider.provider, logo: "fa-question-circle" };
                provider.logo = "fa-microsoft";
                if (provider.provider === "oidc") { provider.logo = "fa-openid"; }
                if (provider.provider === "google") { provider.logo = "fa-google"; }
                if (provider.provider === "saml") { provider.logo = "fa-windows"; }
                //result.push(item);
            });
            if (items.length === 0) {
                const item: any = { name: "Local", id: "local", provider: "local", logo: "fa-question-circle" };
                items.push(item);
            }
            return items;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async ClearProviders() {
        await this.memoryCache.del("providers");
    }
    public async FindRequestTokenID(key: string, parent: Span): Promise<TokenRequest> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindRequestTokenID", parent);
        try {
            if (NoderedUtil.IsNullEmpty(key)) return null;
            if (Config.cache_store_type == "redis") {
                return await this.memoryCache.get("requesttoken" + key);
            } else {
                return await this.mongoCache.get("requesttoken" + key);
            }
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async AdddRequestTokenID(key: string, data: any, parent: Span): Promise<TokenRequest> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindRequestTokenID", parent);
        try {
            if (Config.cache_store_type == "redis") {
                return await this.memoryCache.set("requesttoken" + key, data);
            } else {
                return await this.mongoCache.set("requesttoken" + key, data);
            }
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async RemoveRequestTokenID(key: string, parent: Span): Promise<TokenRequest> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindRequestTokenID", parent);
        try {
            if (Config.cache_store_type == "redis") {
                return await this.memoryCache.del("requesttoken" + key);
            } else {
                return await this.mongoCache.del("requesttoken" + key);
            }
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindByAuthorizationWrap(token, jwt, parent) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add authentication header to cache");
        return LoginProvider.validateToken(token, parent);
    }
    public FindByAuthorizationWrap2(login, password, jwt, parent) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add basicauth header to cache");
        return Auth.ValidateByPassword(login, password, parent);
    }
    public async FindByAuthorization(authorization: string, jwt: string, parent: Span): Promise<User> {
        if (!NoderedUtil.IsNullEmpty(authorization) && authorization.indexOf(" ") > 1 &&
            (authorization.toLocaleLowerCase().startsWith("bearer") || authorization.toLocaleLowerCase().startsWith("jwt"))) {
            const token = authorization.split(" ")[1].toString();
            let item: User = await this.memoryCache.wrap(token, () => { return this.FindByAuthorizationWrap(token, jwt, parent) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), parent);
        }
        const b64auth = (authorization || '').split(' ')[1].toString() || ''
        // const [login, password] = new Buffer(b64auth, 'base64').toString().split(':')
        const [login, password] = Buffer.from(b64auth, "base64").toString().split(':')
        if (!NoderedUtil.IsNullEmpty(login) && !NoderedUtil.IsNullEmpty(password)) {
            let item: User = await this.memoryCache.wrap(b64auth, () => { return this.FindByAuthorizationWrap2(login, password, jwt, parent) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), parent);
        }
    }
    public FindQueueByIdWrap(_id, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add queue to cache : " + _id);
        return Config.db.getbyid<User>(_id, "mq", jwt, true, span);
    }
    public async FindQueueById(_id: string, jwt: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(_id)) return null;
            var key = ("mq_" + _id).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindQueueByIdWrap(_id, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindQueueByNameWrap(name, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add queue to cache : " + name);
        return Config.db.GetOne<User>({ query: { name }, collectionname: "mq", jwt }, span);
    }
    public async FindQueueByName(name: string, jwt: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(name)) return null;
            var key = ("queuename_" + name).toString();
            let item = await this.memoryCache.wrap(key, () => { return this.FindQueueByNameWrap(name, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindExchangeByIdWrap(_id, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add exchange to cache : " + _id);
        return Config.db.getbyid<User>(_id, "mq", jwt, true, span);
    }
    public async FindExchangeById(_id: string, jwt: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(_id)) return null;
            var key = ("mq_" + _id).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindExchangeByIdWrap(_id, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindExchangeByNameWrap(name, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add exchange to cache : " + name);
        return Config.db.GetOne<User>({ query: { name }, collectionname: "mq", jwt }, span);
    }
    public async FindExchangeByName(name: string, jwt: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(name)) return null;
            var key = ("exchangename_" + name).toString();
            let item = await this.memoryCache.wrap(key, () => { return this.FindExchangeByNameWrap(name, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindRoleByIdWrap(_id, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add role to cache : " + _id);
        return Config.db.getbyid<User>(_id, "users", jwt, true, span);
    }
    public async FindRoleById(_id: string, jwt: string, parent: Span): Promise<Role> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindById", parent);
        try {
            if (NoderedUtil.IsNullEmpty(_id)) return null;
            var key = ("users_" + _id).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindRoleByIdWrap(_id, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return Role.assign(item);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindByUsernameWrap(username, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add user to cache by username : " + username);
        return Config.db.getbyusername<User>(username, null, jwt, true, span);
    }
    public async FindByUsername(username: string, jwt: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindByUsername", parent);
        try {
            if (NoderedUtil.IsNullEmpty(username)) return null;
            var key = ("username_" + username).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindByUsernameWrap(username, jwt, span); });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public GetDisposableDomainWrap(domain, span) {
        const jwt = Crypt.rootToken();
        Logger.instanse.debug("Add to cache : " + domain);
        const query = { name: domain, "_type": "disposable" };
        return Config.db.GetOne<Base>({ query, collectionname: "domains", jwt }, span);
    }
    public async GetDisposableDomain(domain: string, parent: Span): Promise<Base> {
        await this.init();
        if (domain.indexOf("@") > -1) {
            domain = domain.substring(domain.indexOf("@") + 1);
        }
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindByUsername", parent);
        try {
            if (NoderedUtil.IsNullEmpty(domain)) return null;
            var key = ("disposable_" + domain).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.GetDisposableDomainWrap(domain, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return item;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public FindByUsernameOrFederationidWrap(username, issuer, span) {
        const jwt = Crypt.rootToken();
        Logger.instanse.debug("Add federationid to cache : " + username);
        return Config.db.getbyusername<User>(username, issuer, jwt, true, span);
    }
    public async FindByUsernameOrFederationid(username: string, issuer: string, parent: Span): Promise<User> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindByUsername", parent);
        try {
            if (NoderedUtil.IsNullEmpty(username)) return null;
            var key = ("federation_" + username).toString().toLowerCase();
            let item = await this.memoryCache.wrap(key, () => { return this.FindByUsernameOrFederationidWrap(username, issuer, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return this.DecorateWithRoles(User.assign(item), span);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }

    }
    DecorateWithRolesWrap(user, span) {
        Logger.instanse.debug("Add userroles to cache : " + user._id + " " + user.name);
        const pipe: any = [{ "$match": { "_id": user._id } },
            {
                "$graphLookup": {
                    from: "users",
                    startWith: "$_id",
                    connectFromField: "_id",
                    connectToField: "members._id",
                    as: "roles",
                    maxDepth: Config.max_recursive_group_depth,
                    depthField: "depth"
                    , restrictSearchWithMatch: { "_type": "role" }
                    // , "_id": { $nin: Config.db.WellknownIdsArray }, "members._id": { $nin: Config.db.WellknownIdsArray }
                }
            }, {
                "$graphLookup": {
                    from: "users",
                    startWith: "$_id",
                    connectFromField: "members._id",
                    connectToField: "members._id",
                    as: "roles2",
                    maxDepth: 0,
                    depthField: "depth",
                    restrictSearchWithMatch: { "_type": "role" }
                }
            },
            {
                "$project": {
                    _id: 1,
                    name: 1,
                    username: 1,
                    roles: {
                        $map: {
                            input: "$roles",
                            as: "roles",
                            in: {
                                "name": "$$roles.name",
                                "_id": "$$roles._id"
                            }
                        }
                    },
                    roles2: {
                        $map: {
                            input: "$roles2",
                            as: "roles2",
                            in: {
                                "name": "$$roles2.name",
                                "_id": "$$roles2._id"
                            }
                        }
                    }

                }
            }
        ]
        return Config.db.aggregate<User>(pipe, "users", Crypt.rootToken(), null, span);
    }
    public DecorateWithRolesAllRolesWrap(span) {
        Logger.instanse.debug("Add all roles");
        return Config.db.query<Role>({ query: { _type: "role" }, projection: { "name": 1, "members": 1 }, top: Config.expected_max_roles, collectionname: "users", jwt: Crypt.rootToken() }, span);
    }
    public async DecorateWithRoles<T extends TokenUser | User>(user: T, parent: Span): Promise<T> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.DecorateWithRoles", parent);
        try {
            if (NoderedUtil.IsNullUndefinded(user)) return null;
            if (!Config.decorate_roles_fetching_all_roles) {
                if (!user.roles) user.roles = [];
                var key = ("userroles_" + user._id).toString().toLowerCase();
                const results = await this.memoryCache.wrap(key, () => { return this.DecorateWithRolesWrap(user, span) });

                if (results.length > 0) {
                    user.roles = [];
                    results[0].roles.forEach(r => {
                        const exists = user.roles.filter(x => x._id == r._id);
                        if (exists.length == 0) user.roles.push(r);
                    });
                    results[0].roles2.forEach(r => {
                        const exists = user.roles.filter(x => x._id == r._id);
                        if (exists.length == 0) user.roles.push(r);
                    });
                }
                let hasusers = user.roles.filter(x => x._id == WellknownIds.users);
                if (hasusers.length == 0) {
                    user.roles.push(new Rolemember("users", WellknownIds.users));
                    Logger.instanse.debug(user.name + " missing from users, adding it");
                    await Config.db.db.collection("users").updateOne(
                        { _id: WellknownIds.users },
                        { "$push": { members: new Rolemember(user.name, user._id) } }
                    );

                }
                return user;
            }
            let cached_roles = await this.memoryCache.wrap("allroles", () => { return this.DecorateWithRolesAllRolesWrap(span) });
            if (cached_roles.length === 0 && user.username !== "root") {
                throw new Error("System has no roles !!!!!!");
            }
            user.roles = [];
            for (let role of cached_roles) {
                let isMember: number = -1;
                if (role.members !== undefined) { isMember = role.members.map(function (e: Rolemember): string { return e._id; }).indexOf(user._id); }
                if (isMember > -1) {
                    user.roles.push(new Rolemember(role.name, role._id));
                }
            }
            let hasusers = user.roles.filter(x => x._id == WellknownIds.users);
            if (hasusers.length == 0) {
                user.roles.push(new Rolemember("users", WellknownIds.users));
            }
            let updated: boolean = false;
            do {
                updated = false;
                for (let userrole of user.roles) {
                    for (let role of cached_roles) {
                        let isMember: number = -1;
                        if (role.members !== undefined) { isMember = role.members.map(function (e: Rolemember): string { return e._id; }).indexOf(userrole._id); }
                        if (isMember > -1) {
                            const beenAdded: number = user.roles.map(function (e: Rolemember): string { return e._id; }).indexOf(role._id);
                            if (beenAdded === -1) {
                                user.roles.push(new Rolemember(role.name, role._id));
                                updated = true;
                            }
                        }
                    }
                }
            } while (updated)
            user.roles.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
        return user as any;
    }
    public FindRoleByNameWrap(name, jwt, span) {
        if (jwt === null || jwt == undefined || jwt == "") { jwt = Crypt.rootToken(); }
        Logger.instanse.debug("Add role to cache : " + name);
        return Config.db.GetOne<Role>({ query: { name: name, "_type": "role" }, collectionname: "users", jwt }, span)
    }
    public async FindRoleByName(name: string, jwt: string, parent: Span): Promise<Role> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.FindByUsername", parent);
        try {
            var key = ("rolename_" + name).toString();
            let item = await this.memoryCache.wrap(key, async () => { return this.FindRoleByNameWrap(name, jwt, span) });
            if (NoderedUtil.IsNullUndefinded(item)) return null;
            return Role.assign(item);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async UserRoleUpdateId(id: string, watch: boolean) {
        if (!NoderedUtil.IsNullEmpty(id)) return;
        var u = new Base(); u._id = id;
        return this.UserRoleUpdate(u, watch);
    }
    public doClear(watch: boolean) {
        var doit: boolean = false;
        if (watch && Config.cache_store_type != "redis" && Config.cache_store_type != "mongodb") {
            doit = true;
        } else if (!watch && (Config.cache_store_type == "redis" || Config.cache_store_type == "mongodb")) {
            doit = true;
        }
        if (Config.enable_openflow_amqp && Config.cache_store_type != "redis" && Config.cache_store_type != "mongodb") {
            Logger.instanse.debug("Send clearcache command");
            amqpwrapper.Instance().send("openflow", "", { "command": "clearcache" }, 20000, null, "", 1);
            return false;
        }
        return doit;
    }
    public async UserRoleUpdate(userrole: Base | TokenUser, watch: boolean) {
        if (NoderedUtil.IsNullUndefinded(userrole)) return;
        if (!this.doClear(watch)) return;
        if (userrole._type == "user") {
            Logger.instanse.debug("Remove user from cache : " + userrole._id);
            let u: User = userrole as any;
            if (!NoderedUtil.IsNullEmpty(u._id)) await Logger.DBHelper.memoryCache.del(("users_" + u._id).toString());
            if (!NoderedUtil.IsNullEmpty(u.username)) await Logger.DBHelper.memoryCache.del(("username_" + u.username).toString());
            if (!NoderedUtil.IsNullEmpty(u.email)) await Logger.DBHelper.memoryCache.del(("username_" + u.email).toString());
            if (!NoderedUtil.IsNullEmpty(u._id)) await Logger.DBHelper.memoryCache.del(("userroles_" + u._id).toString());
            if (u.federationids != null && Array.isArray(u.federationids)) {
                for (var i = 0; i < u.federationids.length; i++) {
                    var fed = u.federationids[i];
                    // has self property with value id
                    if (fed.hasOwnProperty("id")) {
                        await Logger.DBHelper.memoryCache.del(("federation_" + fed.id).toString());
                    } else {
                        await Logger.DBHelper.memoryCache.del(("federation_" + fed).toString());
                    }
                }
            }
            await Logger.DBHelper.memoryCache.del("allroles");
        } else if (userrole._type == "role") {
            let r: Role = userrole as any;
            if (!NoderedUtil.IsNullEmpty(r._id)) await Logger.DBHelper.memoryCache.del(("users_" + r._id).toString());
            if (!NoderedUtil.IsNullEmpty(r.name)) await Logger.DBHelper.memoryCache.del(("rolename_" + r.name).toString());
            await Logger.DBHelper.memoryCache.del("allroles");
        } else if (userrole._type == "customer") {
            if (!NoderedUtil.IsNullEmpty(userrole._id)) await Logger.DBHelper.memoryCache.del(("users_" + userrole._id).toString());
        }

    }
    public async QueueUpdate(_id: string, name: string, watch: boolean) {
        if (!this.doClear(watch)) return;
        Logger.instanse.debug("Clear queue cache : " + name + " " + _id);
        if (!NoderedUtil.IsNullEmpty(name)) await Logger.DBHelper.memoryCache.del(("queuename_" + name).toString());
        if (!NoderedUtil.IsNullEmpty(_id)) await Logger.DBHelper.memoryCache.del(("mq_" + _id).toString());
    }
    public async ExchangeUpdate(_id: string, name: string, watch: boolean) {
        if (!this.doClear(watch)) return;
        Logger.instanse.debug("Clear exchange cache : " + name + " " + _id);
        if (!NoderedUtil.IsNullEmpty(name)) await Logger.DBHelper.memoryCache.del(("exchangename_" + name).toString());
        if (!NoderedUtil.IsNullEmpty(_id)) await Logger.DBHelper.memoryCache.del(("mq_" + _id).toString());
    }
    public async WorkitemQueueUpdate(wiqid: string, watch: boolean) {
        if (!this.doClear(watch)) return;
        Logger.instanse.debug("Clear workitem queue cache : " + wiqid);
        await this.DeleteKey("pushablequeues");
        if (!NoderedUtil.IsNullEmpty(wiqid)) await this.DeleteKey("pendingworkitems_" + wiqid);
    }
    public GetPushableQueuesWrap(span) {
        Logger.instanse.debug("Add pushable queues");
        return Config.db.query<WorkitemQueue>({
            query: {
                "$or": [
                    { robotqueue: { "$exists": true, $nin: [null, "", "(empty)"] }, workflowid: { "$exists": true, $nin: [null, "", "(empty)"] } },
                    { amqpqueue: { "$exists": true, $nin: [null, "", "(empty)"] } }]
            }, collectionname: "mq", jwt: Crypt.rootToken()
        }, span);
    }
    public async GetPushableQueues(parent: Span): Promise<WorkitemQueue[]> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetPushableQueues", parent);
        try {
            let items = await this.memoryCache.wrap("pushablequeues", () => { return this.GetPushableQueuesWrap(span) });
            return items;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public GetPendingWorkitemsCountWrap(wiqid, span) {
        Logger.instanse.debug("Saving pending workitems count for wiqid " + wiqid);
        // TODO: skip nextrun ? or accept neextrun will always be based of cache TTL or substract the TTL ?
        const query = { "wiqid": wiqid, state: "new", "_type": "workitem", "nextrun": { "$lte": new Date(new Date().toISOString()) } };
        return Config.db.count({
            query, collectionname: "workitems", jwt: Crypt.rootToken()
        }, span);
    }
    public async GetPendingWorkitemsCount(wiqid: string, parent: Span): Promise<number> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetPendingWorkitemsCount", parent);
        try {
            var key = ("pendingworkitems_" + wiqid).toString().toLowerCase();
            let count = await this.memoryCache.wrap(key, () => { return this.GetPendingWorkitemsCountWrap(wiqid, span); });
            return count;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async Save(item: User | Role, jwt: string, parent: Span): Promise<void> {
        await Config.db._UpdateOne(null, item, "users", 2, false, jwt, parent);
    }
    public async EnsureRole(jwt: string, name: string, id: string, parent: Span): Promise<Role> {
        const span: Span = Logger.otel.startSubSpan("dbhelper.EnsureRole", parent);
        try {
            Logger.instanse.verbose(`FindRoleByName ${name}`);
            let role: Role = await this.FindRoleByName(name, jwt, span);
            if (role == null) {
                Logger.instanse.verbose(`EnsureRole FindRoleById ${name}`);
                role = await this.FindRoleById(id, null, span);
            }
            if (role !== null && (role._id === id || NoderedUtil.IsNullEmpty(id))) { return role; }
            if (role !== null && !NoderedUtil.IsNullEmpty(role._id)) {
                Logger.instanse.warn(`Deleting ${name} with ${role._id} not matcing expected id ${id}`);
                await Config.db.DeleteOne(role._id, "users", false, jwt, span);
            }
            role = new Role(); role.name = name; role._id = id;
            Logger.instanse.verbose(`Adding new role ${name}`);
            role = await Config.db.InsertOne(role, "users", 0, false, jwt, span);
            role = Role.assign(role);
            Base.addRight(role, WellknownIds.admins, "admins", [Rights.full_control]);
            Base.addRight(role, role._id, role.name, [Rights.full_control]);
            Base.removeRight(role, role._id, [Rights.delete]);
            Logger.instanse.verbose(`Updating ACL for new role ${name}`);
            await this.Save(role, jwt, span);
            return Role.assign(role);
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async EnsureUser(jwt: string, name: string, username: string, id: string, password: string, extraoptions: any, parent: Span): Promise<User> {
        const span: Span = Logger.otel.startSubSpan("dbhelper.ensureUser", parent);
        try {
            span?.addEvent("FindByUsernameOrId");
            Logger.instanse.verbose(`FindById ${name} ${id}`);
            let user = await this.FindById(id, span);
            if (user == null) {
                Logger.instanse.verbose(`FindByUsername ${username}`);
                user = await this.FindByUsername(username, null, span);
            }
            if (user !== null && (user._id === id || id === null)) { return user; }
            if (user !== null && id !== null) {
                span?.addEvent("Deleting");
                Logger.instanse.warn(`Deleting ${name} with ${user._id} not matcing expected id ${id}`);
                await Config.db.DeleteOne(user._id, "users", false, jwt, span);
            }
            user = new User();
            if (!NoderedUtil.IsNullUndefinded(extraoptions)) user = Object.assign(user, extraoptions);
            user._id = id; user.name = name; user.username = username;
            if (password !== null && password !== undefined && password !== "") {
                span?.addEvent("SetPassword");
                await Crypt.SetPassword(user, password, span);
            } else {
                span?.addEvent("SetPassword");
                await Crypt.SetPassword(user, Math.random().toString(36).substr(2, 9), span);
            }
            span?.addEvent("Insert user");
            Logger.instanse.verbose(`Adding new user ${name}`);
            user = await Config.db.InsertOne(user, "users", 0, false, jwt, span);
            user = User.assign(user);
            span?.addEvent("DecorateWithRoles");
            Logger.instanse.verbose(`Decorating new user ${name} with roles`);
            user = await this.DecorateWithRoles(user, span);
            span?.addEvent("return user");
            return user;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async EnsureNoderedRoles(user: TokenUser | User, jwt: string, force: boolean, parent: Span): Promise<void> {
        if (Config.auto_create_personal_nodered_group || force) {
            let name = user.username;
            // name = name.split("@").join("").split(".").join("");
            // name = name.toLowerCase();
            name = name.toLowerCase();
            name = name.replace(/([^a-z0-9]+){1,63}/gi, "");


            let noderedadmins = await this.FindRoleByName(name + "noderedadmins", jwt, parent);
            if (noderedadmins == null) {
                noderedadmins = await this.EnsureRole(jwt, name + "noderedadmins", null, parent);
                Base.addRight(noderedadmins, user._id, user.username, [Rights.full_control]);
                Base.removeRight(noderedadmins, user._id, [Rights.delete]);
                noderedadmins.AddMember(user as User);
                await this.Save(noderedadmins, jwt, parent);
            }
        }
        if (Config.auto_create_personal_noderedapi_group || force) {
            let name = user.username;
            // name = name.split("@").join("").split(".").join("");
            // name = name.toLowerCase();
            name = name.toLowerCase();
            name = name.replace(/([^a-z0-9]+){1,63}/gi, "");

            let noderedadmins = await this.FindRoleByName(name + "nodered api users", jwt, parent);
            if (noderedadmins == null) {
                noderedadmins = await this.EnsureRole(jwt, name + "nodered api users", null, parent);
                Base.addRight(noderedadmins, user._id, user.username, [Rights.full_control]);
                Base.removeRight(noderedadmins, user._id, [Rights.delete]);
                noderedadmins.AddMember(user as User);
                await this.Save(noderedadmins, jwt, parent);
            }
        }
    }
    public async UpdateHeartbeat(cli: WebSocketServerClient): Promise<any> {
        if (NoderedUtil.IsNullUndefinded(cli) || NoderedUtil.IsNullUndefinded(cli.user)) return null;
        const dt = new Date(new Date().toISOString());
        const updatedoc = { _heartbeat: dt, lastseen: dt, clientagent: cli.clientagent, clientversion: cli.clientversion, remoteip: cli.remoteip };
        cli.user._heartbeat = dt; cli.user.lastseen = dt;
        if (cli.clientagent == "openrpa") {
            cli.user._rpaheartbeat = dt;
            return { $set: { ...updatedoc, _rpaheartbeat: new Date(new Date().toISOString()), _lastopenrpaclientversion: cli.clientversion } };
        }
        if (cli.clientagent == "nodered") {
            cli.user._noderedheartbeat = dt;
            return { $set: { ...updatedoc, _noderedheartbeat: new Date(new Date().toISOString()), _lastnoderedclientversion: cli.clientversion } };
        }
        if (cli.clientagent == "webapp" || cli.clientagent == "aiotwebapp") {
            (cli.user as any)._webheartbeat = dt;
            return { $set: { ...updatedoc, _webheartbeat: new Date(new Date().toISOString()), _lastwebappclientversion: cli.clientversion } };
        }
        if (cli.clientagent == "powershell") {
            cli.user._powershellheartbeat = dt;
            return { $set: { ...updatedoc, _powershellheartbeat: new Date(new Date().toISOString()), _lastpowershellclientversion: cli.clientversion } };
        }
        if (cli.clientagent == "mobileapp" || cli.clientagent == "aiotmobileapp") {
            (cli.user as any)._webheartbeat = dt;
            (cli.user as any)._mobilheartbeat = dt;
            return {
                $set: {
                    ...updatedoc, _webheartbeat: new Date(new Date().toISOString()), _lastwebappclientversion: cli.clientversion
                    , _mobilheartbeat: new Date(new Date().toISOString()), _lastmobilclientversion: cli.clientversion
                }
            };
        }
        else {
            return { $set: updatedoc };
        }
    }
    public GetIPBlockListWrap(span) {
        return Config.db.query<Base>({ query: { _type: "ipblock" }, projection: { "ips": 1 }, top: 10, collectionname: "config", jwt: Crypt.rootToken() }, span);;
    }
    public async GetIPBlockList(parent: Span): Promise<Base[]> {
        await this.init();
        const span: Span = Logger.otel.startSubSpan("dbhelper.GetIPBlockList", parent);
        try {
            let items = await this.memoryCache.wrap("ipblock", () => { return this.GetIPBlockListWrap(span) });
            if (NoderedUtil.IsNullUndefinded(items)) items = [];
            return items;
        } catch (error) {
            span?.recordException(error);
            throw error;
        } finally {
            Logger.otel.endSpan(span);
        }
    }
    public async ClearIPBlockList() {
        await this.memoryCache.del("ipblock");
    }
}

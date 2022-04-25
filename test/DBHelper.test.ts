const path = require("path");
const env = path.join(process.cwd(), 'config', '.env');
require("dotenv").config({ path: env }); // , debug: false 
import { suite, test, timeout } from '@testdeck/mocha';
import { Config } from "../OpenFlow/src/Config";
import { DatabaseConnection } from '../OpenFlow/src/DatabaseConnection';
import assert = require('assert');
import { Logger } from '../OpenFlow/src/Logger';
import { NoderedUtil, TokenUser, User, WellknownIds } from '@openiap/openflow-api';
import { Crypt } from '../OpenFlow/src/Crypt';
import { DBHelper } from '../OpenFlow/src/DBHelper';

@suite class dbhelper_test {
    private rootToken: string;
    private testUser: User;
    private userToken: string;
    @timeout(10000)
    async before() {
        Config.workitem_queue_monitoring_enabled = false;
        Config.disablelogging();
        Logger.configure(true, true);
        Config.db = new DatabaseConnection(Config.mongodb_url, Config.mongodb_db, false);
        await Config.db.connect(null);
        this.rootToken = Crypt.rootToken();
        this.testUser = await DBHelper.FindByUsername("testuser", this.rootToken, null)
        this.userToken = Crypt.createToken(this.testUser, Config.shorttoken_expires_in);
    }
    async after() {
        await Logger.shutdown();
    }
    @test async 'FindByUsername'() {
        var user = await DBHelper.FindByUsername("testuser", this.rootToken, null);
        assert.notStrictEqual(user, null, "Failed locating test user as root")
        user = await DBHelper.FindByUsername("testuser", this.userToken, null);
        assert.notStrictEqual(user, null, "Failed locating test user as self")
        await assert.rejects(DBHelper.FindByUsername(null, this.rootToken, null));
    }
    @test async 'FindById'() {
        var user = await DBHelper.FindById(this.testUser._id, this.rootToken, null);
        assert.notStrictEqual(user, null, "Failed locating test user as root")
        user = await DBHelper.FindById(this.testUser._id, this.userToken, null);
        assert.notStrictEqual(user, null, "Failed locating test user as self")
        user = await DBHelper.FindById("nonexisting", this.userToken, null);
        assert.strictEqual(user, null, "returned something with illegal id")
        await assert.rejects(DBHelper.FindById(null, this.rootToken, null));
    }
    @test async 'FindByUsernameOrId'() {
        var user = await DBHelper.FindByUsernameOrId(this.testUser.username, null, null);
        assert.notStrictEqual(user, null, "Failed locating user by username")
        user = await DBHelper.FindByUsernameOrId(null, this.testUser._id, null);
        assert.notStrictEqual(user, null, "Failed locating user by userid")
        user = await DBHelper.FindByUsernameOrId("does not exist", null, null);
        assert.strictEqual(user, null, "returned something with illegal username")
        user = await DBHelper.FindByUsernameOrId(null, "does not exist", null);
        assert.strictEqual(user, null, "returned something with illegal id")
        await assert.rejects(DBHelper.FindByUsernameOrId(null, null, null));
    }
    @test async 'FindByUsernameOrFederationid'() {
        var user = await DBHelper.FindByUsernameOrFederationid(this.testUser.username, null);
        assert.notStrictEqual(user, null, "Failed locating user by username")
        user = await DBHelper.FindByUsernameOrFederationid("test@federation.id", null);
        assert.notStrictEqual(user, null, "Failed locating user by federation id")
        await assert.rejects(DBHelper.FindByUsernameOrFederationid(null, null));
    }
    @test async 'DecorateWithRoles'() {
        var tuser = TokenUser.From(this.testUser);
        tuser.roles = [];
        tuser = await DBHelper.DecorateWithRoles(tuser, null);
        assert.notStrictEqual(tuser.roles.length, 0, "No roles added to user")
        Config.decorate_roles_fetching_all_roles = !Config.decorate_roles_fetching_all_roles;
        tuser.roles = [];
        tuser = await DBHelper.DecorateWithRoles(tuser, null);
        assert.notStrictEqual(tuser.roles.length, 0, "No roles added to user")
        await assert.rejects(DBHelper.DecorateWithRoles(null, null));
    }
    @test async 'FindRoleByName'() {
        var role = await DBHelper.FindRoleByName(this.testUser.username, null);
        assert.strictEqual(role, null, "returned something with illegal name")
        role = await DBHelper.FindRoleByName("users", null);
        assert.notStrictEqual(role, null, "Failed locating role users")
    }
    @test async 'FindRoleByNameOrId'() {
        var role = await DBHelper.FindRoleByName(this.testUser.username, null);
        assert.strictEqual(role, null, "returned something with illegal name")
        role = await DBHelper.FindRoleById(this.testUser._id, null, null);
        assert.strictEqual(role, null, "returned something with illegal id")
        role = await DBHelper.FindRoleByName("users", null);
        assert.notStrictEqual(role, null, "Failed locating role users")
        role = await DBHelper.FindRoleById(WellknownIds.users, null, null);
        assert.notStrictEqual(role, null, "Failed locating role users")
        await assert.rejects(DBHelper.FindRoleByName(null, null));
        await assert.rejects(DBHelper.FindRoleById(null, null, null));
    }
    @timeout(5000)
    @test async 'EnsureUser'() {
        var name = "dummytestuser" + NoderedUtil.GetUniqueIdentifier();
        var dummyuser: User = await DBHelper.EnsureUser(this.rootToken, name, name, null, "RandomPassword", null);
        var result = await Crypt.ValidatePassword(dummyuser, "RandomPassword", null);

        await DBHelper.EnsureNoderedRoles(dummyuser, this.rootToken, true, null);

        dummyuser = await DBHelper.DecorateWithRoles(dummyuser, null);
        assert.ok(dummyuser.roles.filter(x => x.name.endsWith("noderedadmins")), "EnsureNoderedRoles did not make dummy user member of noderedadmins");
        assert.ok(dummyuser.roles.filter(x => x.name.endsWith("nodered api users")), "EnsureNoderedRoles did not make dummy user member of nodered api users");


        assert.ok(result, "Failed validating with the correct password");
        await Config.db.DeleteOne(dummyuser._id, "users", this.rootToken, null);

        await assert.rejects(DBHelper.EnsureUser(this.rootToken, null, null, null, null, null));
    }
    @test async 'EnsureRole'() {
        var name = "dummytestrole" + NoderedUtil.GetUniqueIdentifier();
        var dummyrole = await DBHelper.EnsureRole(this.rootToken, name, null, null);
        await Config.db.DeleteOne(dummyrole._id, "users", this.rootToken, null);
        await assert.rejects(DBHelper.EnsureRole(null, null, null, null));
    }
}
// cls | ./node_modules/.bin/_mocha 'test/**/DBHelper.test.ts'
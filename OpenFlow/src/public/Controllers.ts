module openflow {
    "use strict";

    function treatAsUTC(date): number {
        var result = new Date(date);
        result.setMinutes(result.getMinutes() - result.getTimezoneOffset());
        return result as any;
    }

    function daysBetween(startDate, endDate): number {
        var millisecondsPerDay = 24 * 60 * 60 * 1000;
        return (treatAsUTC(endDate) - treatAsUTC(startDate)) / millisecondsPerDay;
    }


    export class WorkflowsCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("WorkflowsCtrl");
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }

        async loadData(): Promise<void> {
            this.loading = true;
            this.charts = [];
            var chart: chartset = null;
            console.log("get workflows");
            this.models = await this.api.Query("openrpa", { _type: "workflow" }, null, null);

            for (var i = 0; i < this.models.length; i++) {
                var workflow = this.models[i] as any;
                var d = new Date();
                d.setMonth(d.getMonth() - 1);
                //d.setDate(d.getDate() - 30);
                console.log(d);


                console.log("get mapreduce of instances");
                var stats = await this.api.MapReduce("openrpa_instances",
                    function map() {
                        var startDate = new Date(this._created);
                        this.count = 1;
                        emit(startDate.toISOString().split('T')[0], this);
                    }, function reduce(key, values) {
                        var reducedObject = { count: 0, value: 0, avg: 0, minrun: 0, maxrun: 0, run: 0, _acl: [] };
                        values.forEach(function (value) {
                            var startDate = new Date(value._created);
                            var endDate = new Date(value._modified);
                            var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
                            if (reducedObject.minrun == 0 && seconds > 0) reducedObject.minrun = seconds;
                            if (reducedObject.minrun > seconds) reducedObject.minrun = seconds;
                            if (reducedObject.maxrun < seconds) reducedObject.maxrun = seconds;
                            reducedObject.run += seconds;
                            reducedObject.count += value.count;
                            reducedObject._acl = value._acl;
                        });
                        return reducedObject;
                    }, function finalize(key, reducedValue) {
                        if (reducedValue.count > 0) {
                            reducedValue.avg = reducedValue.value / reducedValue.count;
                            reducedValue.run = reducedValue.run / reducedValue.count;
                        }
                        return reducedValue;
                    }, { _type: "workflowinstance", WorkflowId: workflow._id, "_created": { "$gte": new Date(d.toISOString()) } }, { inline: 1 }, null);



                // // {$where : function() { return this.date.getMonth() == 11} }
                // var q = { _type: "workflowinstance", WorkflowId: workflow._id, "_created": { "$gte": new Date(d.toISOString()) } };
                // // var q = { _type: "workflowinstance", WorkflowId: workflow._id, "_created": { "$gte": new Date("2010-04-30T00:00:00.000Z") } };

                // workflow.instances = await this.api.Query("openrpa_instances", q, null, null, 100);


                chart = new chartset();
                chart.charttype = "line"
                chart.data = [];
                var lastdate = "";
                var days = daysBetween(d, new Date());
                console.log(stats);
                for (var y = 0; y < days; y++) {
                    var startDate = new Date(d);
                    startDate.setDate(d.getDate() + y);
                    var datestring = startDate.toISOString().split('T')[0];
                    var exists = stats.filter(m => m._id == datestring);
                    if (exists.length > 0) {
                        chart.data.push(exists[0].value.count);
                    } else {
                        chart.data.push(0);
                    }
                    if ((y % 2) == 0 || (days == 30 && y == 30)) {
                        chart.labels.push(startDate.getDate().toString());
                    } else {
                        chart.labels.push("");
                    }
                }
                workflow.chart = chart;

            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }


    export class chartset {
        options: any = {
            legend: { display: true }
        };
        baseColors: string[] = ['#F7464A', '#97BBCD', '#FDB45C', '#46BFBD', '#949FB1', '#4D5360'];
        colors: string[] = this.baseColors;
        type: string = 'bar';
        heading: string = "";
        labels: string[] = [];
        series: string[] = [];
        data: any[] = [];
        charttype: string = "bar";

    }
    export declare function emit(k, v);
    export class ReportsCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("ReportsCtrl");
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }

        async loadData(): Promise<void> {
            this.loading = true;
            this.charts = [];
            var chart: chartset = null;

            console.log("get mapreduce of instances");
            var stats = await this.api.MapReduce("openrpa_instances",
                function map() {
                    this.count = 1;
                    emit(this.WorkflowId, this);
                }, function reduce(key, values) {
                    var reducedObject = { count: 0, value: 0, avg: 0, minrun: 0, maxrun: 0, run: 0, _acl: [] };
                    values.forEach(function (value) {
                        var startDate = new Date(value._created);
                        var endDate = new Date(value._modified);
                        var seconds = (endDate.getTime() - startDate.getTime()) / 1000;
                        if (reducedObject.minrun == 0 && seconds > 0) reducedObject.minrun = seconds;
                        if (reducedObject.minrun > seconds) reducedObject.minrun = seconds;
                        if (reducedObject.maxrun < seconds) reducedObject.maxrun = seconds;
                        reducedObject.run += seconds;
                        reducedObject.count += value.count;
                        reducedObject._acl = value._acl;
                    });
                    return reducedObject;
                }, function finalize(key, reducedValue) {
                    if (reducedValue.count > 0) {
                        reducedValue.avg = reducedValue.value / reducedValue.count;
                        reducedValue.run = reducedValue.run / reducedValue.count;
                    }
                    return reducedValue;
                }, {}, { inline: 1 }, null);


            console.log("get workflows");
            var workflows = await this.api.Query("openrpa", { _type: "workflow" }, null, null);
            console.log("get workflow instances");
            var workflowids = [];
            workflows.forEach(workflow => {
                workflowids.push(workflow._id);
            });
            var q = { WorkflowId: { $in: workflowids } }
            var instances = await this.api.Query("openrpa_instances", q, null, null);



            chart = new chartset();
            chart.heading = "compare run times";
            chart.series = ['minrun', 'avgrun', 'maxrun'];
            // chart.labels = ['ok', 'warning', 'alarm'];
            chart.data = [[], [], []];
            for (var x = 0; x < stats.length; x++) {
                var model = stats[x].value;
                var _id = stats[x]._id;
                var workflow = workflows.filter(y => y._id == _id)[0];
                if (workflow !== undefined) {
                    chart.data[0].push(model.minrun);
                    chart.data[1].push(model.run);
                    chart.data[2].push(model.maxrun);
                    var id = stats[x]._id;
                    var workflow = workflows.filter(x => x._id == id)[0];
                    if (workflow == undefined) { chart.labels.push("unknown"); } else { chart.labels.push(workflow.name); }
                }
            }
            this.charts.push(chart);



            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class MainCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api,
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("MainCtrl");
            console.log("MainCtrl::constructor");
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }

        async InsertNew(): Promise<void> {
            // this.loading = true;
            var model = { name: "Find me " + Math.random().toString(36).substr(2, 9), "temp": "hi mom" };
            var result = await this.api.Insert(this.collection, model);
            this.models.push(result);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async UpdateOne(model: any): Promise<any> {
            var index = this.models.indexOf(model);
            this.loading = true;
            model.name = "Find me " + Math.random().toString(36).substr(2, 9);
            var newmodel = await this.api.Update(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.models.splice(index, 0, newmodel);
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async InsertMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<InsertOneMessage>[] = [];
            var q: InsertOneMessage = new InsertOneMessage();
            for (var i: number = (this.models.length); i < (this.models.length + 50); i++) {
                q.collectionname = "entities"; q.item = { name: "findme " + i.toString(), "temp": "hi mom" };
                var msg: Message = new Message(); msg.command = "insertone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            }
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: InsertOneMessage[] = results.filter(result => !(result instanceof Error));
            // this.models.push(...values);
            values.forEach(element => {
                this.models.push(element.result);
            });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = "entities"; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    function iosGetOnesignalToken() {
        return new Promise<any>(async (resolve, reject) => {
            try {
                (window as any).bridge.post('onesignaltoken', {}, (results, error) => {
                    if (error) { return reject(error); }
                    console.log(results);
                    resolve(results);
                });
            } catch (error) {
                reject(error);
            }
        });
    }
    export class LoginCtrl {
        public localenabled: boolean = false;
        public providers: any = false;
        public username: string = "";
        public password: string = "";
        public message: string = "";
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient"
        ];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient
        ) {
            console.log("LoginCtrl::constructor");
            WebSocketClient.getJSON("/loginproviders", async (error: any, data: any) => {
                this.providers = data;
                for (var i: number = this.providers.length - 1; i >= 0; i--) {
                    if (this.providers[i].provider == "local") {
                        this.providers.splice(i, 1);
                        this.localenabled = true;
                    }
                }

                if (!this.$scope.$$phase) { this.$scope.$apply(); }
            });
        }
        async submit(): Promise<void> {
            this.message = "";
            var q: SigninMessage = new SigninMessage();
            q.username = this.username; q.password = this.password;
            var msg: Message = new Message(); msg.command = "signin"; msg.data = JSON.stringify(q);
            try {
                console.debug("signing in with username/password");
                var a: any = await this.WebSocketClient.Send(msg);
                var result: SigninMessage = a;
                if (result.user == null) { return; }
                this.$scope.$root.$broadcast(msg.command, result);
                this.WebSocketClient.user = result.user;
                this.$location.path("/");
            } catch (error) {
                this.message = error;
                console.error(error);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class MenuCtrl {
        public user: TokenUser;
        public signedin: boolean = false;
        public path: string = "";
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient"
        ];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient
        ) {
            console.log("MenuCtrl::constructor");
            $scope.$root.$on('$routeChangeStart', (...args) => { this.routeChangeStart.apply(this, args); });
            this.path = this.$location.path();
            var cleanup = this.$scope.$on('signin', (event, data) => {
                if (event && data) { }
                this.user = data.user;
                this.signedin = true;
                if (!this.$scope.$$phase) { this.$scope.$apply(); }
                // cleanup();
            });
        }
        routeChangeStart(event: any, next: any, current: any) {
            this.path = this.$location.path();
        }
    }

    export class ProvidersCtrl extends entitiesCtrl<openflow.Provider> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("ProvidersCtrl");
            this.basequery = { _type: "provider" };
            this.collection = "config";
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

    }
    export class ProviderCtrl extends entityCtrl<openflow.Provider> {
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("ProviderCtrl");
            this.collection = "config";
            WebSocketClient.onSignedin((user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    this.loadData();
                } else {
                    this.model = new Provider("", "", "", "",
                        "")
                }

            });
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Providers");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }



    export class UsersCtrl extends entitiesCtrl<openflow.TokenUser> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("UsersCtrl");
            this.basequery = { _type: "user" };
            this.collection = "users";
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
                this._loadData();
            });

        }
        async _loadData(): Promise<void> {
            this.loading = true;
            var chart: chartset = null;
            console.log("get users");
            this.models = await this.api.Query("users", { _type: "user" }, null, null);

            for (var i = 0; i < this.models.length; i++) {
                var user = this.models[i] as any;
                var d = new Date();
                d.setMonth(d.getMonth() - 1);
                //d.setDate(d.getDate() - 30);


                console.log("get mapreduce for " + user.name);
                var stats = await this.api.MapReduce("audit",
                    function map() {
                        var startDate = new Date(this._created);
                        this.count = 1;
                        emit(startDate.toISOString().split('T')[0], this);
                    }, function reduce(key, values) {
                        var reducedObject = { count: 0, value: 0, avg: 0, minrun: 0, maxrun: 0, run: 0, _acl: [] };
                        values.forEach(function (value) {
                            reducedObject.count += value.count;
                            reducedObject._acl = value._acl;
                        });
                        return reducedObject;
                    }, function finalize(key, reducedValue) {
                        if (reducedValue.count > 0) {
                            reducedValue.avg = reducedValue.value / reducedValue.count;
                        }
                        return reducedValue;
                    }, { userid: user._id, "_created": { "$gte": new Date(d.toISOString()) } }, { inline: 1 }, null);

                chart = new chartset();
                chart.charttype = "line"
                chart.data = [];
                var days = daysBetween(d, new Date());
                for (var y = 0; y < days; y++) {
                    var startDate = new Date(d);
                    startDate.setDate(d.getDate() + y);
                    var datestring = startDate.toISOString().split('T')[0];
                    var exists = stats.filter(m => m._id == datestring);
                    if (exists.length > 0) {
                        chart.data.push(exists[0].value.count);
                    } else {
                        chart.data.push(0);
                    }
                    //chart.labels.push(datestring);
                    if ((y % 2) == 0 || (days == 30 && y == 30)) {
                        chart.labels.push(startDate.getDate().toString());
                    } else {
                        chart.labels.push("");
                    }
                }
                user.chart = chart;

            }
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class UserCtrl extends entityCtrl<openflow.TokenUser> {
        public newid: string;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("UserCtrl");
            this.collection = "users";
            WebSocketClient.onSignedin((user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    this.loadData();
                } else {
                    this.model = new openflow.TokenUser("", "");
                    this.model._type = "user";
                    this.model.name = "";
                    this.model.username = "";
                    this.model.newpassword = "";
                    this.model.sid = "";
                    this.model.federationids = [];
                }

            });
        }
        deleteid(id) {
            if (this.model.federationids === null || this.model.federationids === undefined) {
                this.model.federationids = [];
            }
            this.model.federationids = this.model.federationids.filter(function (m: any): boolean { return m !== id; });
        }
        addid() {
            if (this.model.federationids === null || this.model.federationids === undefined) {
                this.model.federationids = [];
            }
            this.model.federationids.push(this.newid);
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Users");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }





    export class RolesCtrl extends entitiesCtrl<openflow.Role> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("RolesCtrl");
            this.basequery = { _type: "role" };
            this.collection = "users";
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class RoleCtrl extends entityCtrl<openflow.Role> {
        public addthis: any = "";
        public users: any[] = null;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("RoleCtrl");
            this.collection = "users";
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    await this.loadData();
                    await this.loadUsers();
                } else {
                    this.model = new openflow.Role("");
                }

            });
        }
        async loadUsers(): Promise<void> {
            var q: QueryMessage = new QueryMessage();
            q.collectionname = this.collection;
            // q.query = {};
            q.query = { $or: [{ _type: "user" }, { _type: "role" }] };
            var msg: Message = new Message(); msg.command = "query"; msg.data = JSON.stringify(q);
            q = await this.WebSocketClient.Send<QueryMessage>(msg);
            this.users = q.result;
            var ids: string[] = [];
            if (this.model.members === undefined) { this.model.members = []; }
            for (var i: number = 0; i < this.model.members.length; i++) {
                ids.push(this.model.members[i]._id);
            }
            for (var i: number = this.users.length - 1; i >= 0; i--) {
                if (ids.indexOf(this.users[i]._id) > -1) {
                    this.users.splice(i, 1);
                }
            }
            this.addthis = q.result[0]._id;

            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async submit(): Promise<void> {
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Roles");
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        RemoveMember(model: any) {
            if (this.model.members === undefined) { this.model.members = []; }
            for (var i: number = 0; i < this.model.members.length; i++) {
                if (this.model.members[i]._id === model._id) {
                    this.model.members.splice(i, 1);
                }
            }
        }
        AddMember(model: any) {
            if (this.model.members === undefined) { this.model.members = []; }
            var user: any = null;
            this.users.forEach(u => {
                if (u._id === this.addthis) { user = u; }
            });
            this.model.members.push({ name: user.name, _id: user._id });
        }
    }



    export class SocketCtrl {
        public static $inject = [
            "$scope",
            "$location",
            "$routeParams",
            "WebSocketClient",
            "api"
        ];
        public loading: boolean = false;
        public messages: string = "";
        public queuename: string = "webtest";
        public message: string = "Hi mom";
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            console.debug("SocketCtrl");
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                await api.RegisterQueue();
            });
        }

        async submit() {
            await this.SendOne(this.queuename, this.message);
        }
        async SendOne(queuename: string, message: any): Promise<void> {
            var result: any = await this.api.QueueMessage(queuename, message);
            try {
                // result = JSON.parse(result);
            } catch (error) {
            }
            this.messages += result + "\n";
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }




    export class EntitiesCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("EntitiesCtrl");
            this.basequery = {};
            this.collection = $routeParams.collection;
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }

    export class FormsCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("EditFormCtrl");
            this.collection = "forms";
            this.baseprojection = { _type: 1, type: 1, name: 1, _created: 1, _createdby: 1, _modified: 1 };
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }
        async DeleteOne(model: any): Promise<any> {
            this.loading = true;
            await this.api.Delete(this.collection, model);
            this.models = this.models.filter(function (m: any): boolean { return m._id !== model._id; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
    }
    export class EditFormCtrl extends entityCtrl<openflow.Base> {
        public loading: boolean = false;
        public message: string = "";
        public charts: chartset[] = [];
        public formBuilder: any;
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("EditFormCtrl");
            this.collection = "forms";
            this.basequery = {};
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                this.loadData();
            });
        }
        async loadData(): Promise<void> {
            this.loading = true;
            this.charts = [];
            var chart: chartset = null;
            console.log("get log");
            var res = await this.api.Query(this.collection, this.basequery, null, { _created: -1 }, 1);
            if (res.length > 0) { this.model = res[0]; }
            // this.loading = false;
            // if (!this.$scope.$$phase) { this.$scope.$apply(); }
            this.renderform();
        }
        async Save() {
            console.log("OnSAVE!!!!");
            var json = this.formBuilder.actions.getData('json');
            console.log(json);
            var formRenderOpts = {
                formData: json,
                dataType: 'json'
            };
            var ele: any = $('.render-wrap');
            ele.formRender(formRenderOpts);
        }
        async renderform() {
            // https://www.npmjs.com/package/angular2-json-schema-form
            // http://www.alpacajs.org/demos/form-builder/form-builder.html
            // https://github.com/kevinchappell/formBuilder - https://formbuilder.online/ - https://kevinchappell.github.io/formBuilder/
            var json: string = '[{"type":"select","label":"Select","className":"form-control","name":"select-1559559389368","values":[{"label":"Option 1","value":"option-1","selected":true},{"label":"Option 2","value":"option-2"},{"label":"Option 3","value":"option-3"}]},{"type":"text","label":"Text Field","className":"form-control","name":"text-1559559391301","value":"1221","subtype":"text"},{"type":"textarea","label":"Text Area","className":"form-control","name":"textarea-1559559392649","value":"wfwefwefe","subtype":"textarea"}]';
            var ele: any;
            var fbOptions = {
                formData: json,
                dataType: 'json',
                disabledActionButtons: ['data', 'clear'],
                onSave: this.Save.bind(this)
            };
            ele = $(document.getElementById('fb-editor'));
            this.formBuilder = await ele.formBuilder(fbOptions).promise;

            // ele = document.getElementById("save-template").addEventListener("click", () => {
            //     console.log("SAVE!!!");
            //     formBuilder.actions.save();
            // });

            // var formData = '<form-template><fields><field class="form-control" label="Full Name" name="text-input-1459436848806" type="text" subtype="text"></field><field class="form-control" label="Select" name="select-1459436851691" type="select"><option value="option-1">Option 1</option><option value="option-2">Option 2</option></field><field class="form-control" label="Your Message" name="textarea-1459436854560" type="textarea"></field></fields></form-template>';
            // var formRenderOpts = {
            //     formData: formData,
            //     dataType: 'xml'
            // };

            json = this.formBuilder.actions.getData('json');
            console.log(json);
            var formRenderOpts = {
                formData: json,
                dataType: 'json'
            };

            ele = $('.render-wrap');
            ele.formRender(formRenderOpts);


            // ele = document.getElementById('fb-render');
            // var formData = '<form-template><fields><field class="form-control" label="Full Name" name="text-input-1459436848806" type="text" subtype="text"></field><field class="form-control" label="Select" name="select-1459436851691" type="select"><option value="option-1">Option 1</option><option value="option-2">Option 2</option></field><field class="form-control" label="Your Message" name="textarea-1459436854560" type="textarea"></field></fields></form-template>';
            // var formRenderOpts = {
            //     formData: formData,
            //     dataType: 'xml'
            // };
            // console.log(ele);
            // // ele.formRender(formRenderOpts);

            // const wrap: any = $('.render-wrap');
            // const formRender = wrap.formRender();
            // wrap.formRender('render', formRenderOpts);
            // // or
            // formRender.actions.render(formData)

            // var renderedForm: any = $('<div>');
            // renderedForm.formRender(formRenderOpts);

            // console.log(renderedForm.html());

            // var ele: any = $(document.getElementById('form'));
            // ele.alpaca({
            //     "schema": {
            //         "title": "User Feedback",
            //         "description": "What do you think about Alpaca?",
            //         "type": "object",
            //         "properties": {
            //             "name": {
            //                 "type": "string",
            //                 "title": "Name"
            //             },
            //             "feedback": {
            //                 "type": "string",
            //                 "title": "Feedback"
            //             },
            //             "ranking": {
            //                 "type": "string",
            //                 "title": "Ranking",
            //                 "enum": ['excellent', 'ok', 'so so']
            //             }
            //         }
            //     }
            // });
            // console.log("post editor");

        }

    }
    export class jslogCtrl extends entitiesCtrl<openflow.Base> {
        public loading: boolean = false;
        public message: string = "";
        public charts: chartset[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("jslogCtrl");
            this.collection = "jslog";
            this.basequery = {};
            WebSocketClient.onSignedin((user: TokenUser) => {
                this.loadData();
            });
        }

        async loadData(): Promise<void> {
            this.loading = true;
            this.charts = [];
            var chart: chartset = null;
            console.log("get log");
            this.models = await this.api.Query("jslog", {}, null, { _created: -1 });
            this.loading = false;
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async DeleteMany(): Promise<void> {
            this.loading = true;
            var Promises: Promise<DeleteOneMessage>[] = [];
            var q: DeleteOneMessage = new DeleteOneMessage();
            this.models.forEach(model => {
                q.collectionname = this.collection; q._id = (model as any)._id;
                var msg: Message = new Message(); msg.command = "deleteone"; msg.data = JSON.stringify(q);
                Promises.push(this.WebSocketClient.Send(msg));
            });
            const results: any = await Promise.all(Promises.map(p => p.catch(e => e)));
            const values: DeleteOneMessage[] = results.filter(result => !(result instanceof Error));
            var ids: string[] = [];
            values.forEach((x: DeleteOneMessage) => ids.push(x._id));
            this.models = this.models.filter(function (m: any): boolean { return ids.indexOf(m._id) === -1; });
            this.loading = false;
            this.loadData();
            //if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

    }


    export class EntityCtrl extends entityCtrl<openflow.Base> {
        public addthis: any = "";
        public users: any[] = null;
        public newkey: string = "";
        public showjson: boolean = false;
        public jsonmodel: string = "";
        public newuser: openflow.TokenUser;
        public usergroups: openflow.TokenUser[] = [];
        constructor(
            public $scope: ng.IScope,
            public $location: ng.ILocationService,
            public $routeParams: ng.route.IRouteParamsService,
            public WebSocketClient: WebSocketClient,
            public api: api
        ) {
            super($scope, $location, $routeParams, WebSocketClient, api);
            console.debug("EntityCtrl");
            this.collection = $routeParams.collection;
            WebSocketClient.onSignedin(async (user: TokenUser) => {
                if (this.id !== null && this.id !== undefined) {
                    await this._loadData();
                } else {
                    this.model = new openflow.Base();
                    this.model._type = "role";
                    this.model.name = "";
                    this.keys = Object.keys(this.model);
                }
            });
        }
        togglejson() {
            this.showjson = !this.showjson;
            if (this.showjson) {
                this.jsonmodel = JSON.stringify(this.model, null, 2);
            } else {
                this.model = JSON.parse(this.jsonmodel);
            }
        }
        async _loadData(): Promise<void> {
            this.usergroups = await this.api.Query("users", {});

            var results = await this.api.Query(this.collection, this.basequery, this.baseprojection, null, 1);
            if (results.length == 0) { return; }
            this.model = results[0];
            this.keys = Object.keys(this.model);
            for (var i: number = this.keys.length - 1; i >= 0; i--) {
                if (this.keys[i].startsWith('_')) this.keys.splice(i, 1);
            }
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }
        async submit(): Promise<void> {
            console.log(this.model);
            if (this.showjson) {
                this.model = JSON.parse(this.jsonmodel);
            }
            if (this.model._id) {
                await this.api.Update(this.collection, this.model);
            } else {
                await this.api.Insert(this.collection, this.model);
            }
            this.$location.path("/Entities/" + this.collection);
            if (!this.$scope.$$phase) { this.$scope.$apply(); }
        }

        removekey(key) {
            if (this.keys.indexOf(key) > -1) {
                this.keys.splice(this.keys.indexOf(key), 1);
            }
            delete this.model[key];
        }
        addkey() {
            if (this.newkey === '') { return; }
            if (this.keys.indexOf(this.newkey) > -1) {
                this.keys.splice(this.keys.indexOf(this.newkey), 1);
            }
            this.keys.push(this.newkey);
            this.model[this.newkey] = '';
            this.newkey = '';
        }



        removeuser(_id) {
            for (var i = 0; i < this.model._acl.length; i++) {
                if (this.model._acl[i]._id == _id) {
                    this.model._acl.splice(i, 1);
                    //this.model._acl = this.model._acl.splice(index, 1);
                }
            }
        }
        adduser() {
            console.log(this.newuser);
            var ace = {
                deny: false,
                _id: this.newuser._id,
                name: this.newuser.name,
                rights: "//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8="
            }
            console.log(this.model._acl);
            this.model._acl.push(ace);
        }
        isBitSet(base64: string, bit: number): boolean {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            return (currentValue & mask) != 0;
        }
        setBit(base64: string, bit: number) {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            var newValue = currentValue | mask;
            view[octet] = newValue;
            return this._arrayBufferToBase64(view);
        }
        unsetBit(base64: string, bit: number) {
            bit--;
            var buf = this._base64ToArrayBuffer(base64);
            var view = new Uint8Array(buf);
            var octet = Math.floor(bit / 8);
            var currentValue = view[octet];
            var _bit = (bit % 8);
            var mask = Math.pow(2, _bit);
            var newValue = currentValue &= ~mask;
            view[octet] = newValue;
            return this._arrayBufferToBase64(view);
        }
        toogleBit(a: any, bit: number) {
            //console.log('toogleBit: ' + bit);
            // var buf = this._base64ToArrayBuffer(a.rights);
            // var view = new Uint8Array(buf);
            // console.log(view);
            if (this.isBitSet(a.rights, bit)) {
                a.rights = this.unsetBit(a.rights, bit);
            } else {
                a.rights = this.setBit(a.rights, bit);
            }
            var buf2 = this._base64ToArrayBuffer(a.rights);
            var view2 = new Uint8Array(buf2);
            console.log(view2);
        }
        _base64ToArrayBuffer(string_base64): ArrayBuffer {
            var binary_string = window.atob(string_base64);
            var len = binary_string.length;
            var bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) {
                //var ascii = string_base64.charCodeAt(i);
                var ascii = binary_string.charCodeAt(i);
                bytes[i] = ascii;
            }
            return bytes.buffer;
        }
        _arrayBufferToBase64(array_buffer): string {
            var binary = '';
            var bytes = new Uint8Array(array_buffer);
            var len = bytes.byteLength;
            for (var i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i])
            }
            return window.btoa(binary);
        }


    }

}

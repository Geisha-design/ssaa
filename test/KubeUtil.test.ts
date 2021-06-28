const path = require("path");
const env = path.join(process.cwd(), 'config', '.env');
require("dotenv").config({ path: env }); // , debug: false 
import { suite, test } from '@testdeck/mocha';
import { Message } from "../OpenFlow/src/Messages/Message";
import { Config } from "../OpenFlow/src/Config";
import { DatabaseConnection } from '../OpenFlow/src/DatabaseConnection';
import assert = require('assert');
import { Logger } from '../OpenFlow/src/Logger';
import { NoderedUtil } from '@openiap/openflow-api';
import { license_data } from '../OpenFlow/src/otelspec';
import { KubeUtil } from '../OpenFlow/src/KubeUtil';

@suite class OpenFlowKubeUtilTests {
    async before() {
        Logger.configure(true, true);
        Config.db = new DatabaseConnection(Config.mongodb_url, Config.mongodb_db);
        await Config.db.connect(null);
    }
    async after() {
        await Config.db.shutdown();
    }
    @test async 'GetStatefulSet'() {
        var sfs = await KubeUtil.instance().GetStatefulSet(Config.namespace, "findme");
        assert.strictEqual(sfs, null)
    }
    @test async 'GetDeployment'() {
        var dep = await KubeUtil.instance().GetDeployment(Config.namespace, "api");
        assert.notStrictEqual(dep, null);
        assert.strictEqual(dep.metadata.name, "api");
    }
    @test async 'GetIngressV1beta1'() {
        var dep = await KubeUtil.instance().GetIngressV1beta1(Config.namespace, "useringress");
        assert.notStrictEqual(dep, null);
        assert.strictEqual(dep.metadata.name, "useringress");
    }
    @test async 'listNamespacedPod'() {
        const list = await KubeUtil.instance().CoreV1Api.listNamespacedPod(Config.namespace);
        assert.notStrictEqual(list, null);
        assert.notStrictEqual(list.body, null);
        assert.notStrictEqual(list.body.items, null);
        assert.ok(list.body.items.length > 0)
        var pod = list.body.items[0];
        var name = pod.metadata.name;
        pod = await KubeUtil.instance().GetPod(Config.namespace, pod.metadata.name);
        assert.notStrictEqual(pod, null);
        assert.strictEqual(pod.metadata.name, name);

        var metrics = await KubeUtil.instance().GetPodMetrics(Config.namespace, name);
        assert.notStrictEqual(metrics, null);
        assert.notStrictEqual(metrics.cpu, null);
        assert.notStrictEqual(metrics.memory, null);
    }
    @test async 'GetService'() {
        var service = await KubeUtil.instance().GetService(Config.namespace, "api");
        assert.notStrictEqual(service, null);
        assert.strictEqual(service.metadata.name, "api");

    }
    @test async 'GetReplicaset'() {
        var rep = await KubeUtil.instance().GetReplicaset(Config.namespace, "name", "test");
        assert.strictEqual(rep, null);
    }
    @test async 'getpods'() {
        var list = await KubeUtil.instance().GetPods(Config.namespace);
        assert.notStrictEqual(list, null);
        assert.notStrictEqual(list.body, null);
        assert.notStrictEqual(list.body.items, null);
        assert.ok(list.body.items.length > 0)
    }
}
// cls | ./node_modules/.bin/_mocha 'test/**/KubeUtil.test.ts'
const {test}=require('node:test');const assert=require('node:assert/strict');const {parseApps}=require('../mobile/apps.cjs');
test('iOS app list maps bundle IDs to validated executable names',()=>{assert.deepEqual(parseApps({'xyz.test':{CFBundleName:'Demo',CFBundleExecutable:'Runner'},'xyz.bad':{CFBundleExecutable:'bad" OR TRUE'}}),[{id:'xyz.test',name:'Demo',process:'Runner'}]);});

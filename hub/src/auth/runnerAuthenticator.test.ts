import { Database } from 'bun:sqlite'
import { expect,it } from 'bun:test'
import { SharedHubStore } from '../store/sharedHubStore'
import { RunnerAuthenticator } from './runnerAuthenticator'
import { keyedHash } from './identityCrypto'
it('fails closed for malformed and wrong secrets',()=>{const db=new Database(':memory:');const store=new SharedHubStore(db,{organizationId:'o1',organizationName:'Pilot'});db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES('u1','o1','u@example.com','admin','active',1)");store.createRunnerProjection({runnerId:'r1',organizationId:'o1',ownerMembershipId:'u1',machineId:'m1',profile:'p1',name:'M',metadata:{},runnerState:{},createdAt:1});store.createRunnerCredential({id:'c1',runnerId:'r1',organizationId:'o1',secretHash:keyedHash('x'.repeat(32),'pepper'),generation:1,createdAt:1});const auth=new RunnerAuthenticator(store,'pepper');expect(auth.authenticate('o1',{credentialId:'c1',secret:'bad'})).toBeNull();expect(auth.authenticate('o1',{credentialId:'c1',secret:'x'.repeat(32)})?.id).toBe('r1');expect(auth.authenticate('o1',{credentialId:'x'.repeat(300),secret:'x'.repeat(32)})).toBeNull()})

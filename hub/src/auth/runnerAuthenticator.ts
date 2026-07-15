import { RunnerCredentialEnvelopeSchema } from '@hapi/protocol/runner-enrollment'
import { keyedHash, safeHashEquals } from './identityCrypto'
import { SharedHubStore } from '../store/sharedHubStore'

export class RunnerAuthenticator {
    constructor(private readonly store:SharedHubStore,private readonly pepper:string){}
    authenticate(organizationId:string,input:unknown){const parsed=RunnerCredentialEnvelopeSchema.safeParse(input);if(!parsed.success)return null;const credential=this.store.findRunnerCredential(organizationId,parsed.data.credentialId);if(!credential||credential.revokedAt!==null||!safeHashEquals(credential.secretHash,keyedHash(parsed.data.secret,this.pepper)))return null;const runner=this.store.findRunner(organizationId,credential.runnerId);return runner?.status==='active'?runner:null}
    authenticateAny(input:unknown){const parsed=RunnerCredentialEnvelopeSchema.safeParse(input);if(!parsed.success)return null;const credential=this.store.findRunnerCredentialById(parsed.data.credentialId);if(!credential||credential.revokedAt!==null||!safeHashEquals(credential.secretHash,keyedHash(parsed.data.secret,this.pepper)))return null;const runner=this.store.findRunner(credential.organizationId,credential.runnerId);return runner?.status==='active'?runner:null}
}

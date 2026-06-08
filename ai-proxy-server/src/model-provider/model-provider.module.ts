import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ModelProviderController } from './model-provider.controller';
import { PlatformCompatController } from './platform-compat.controller';
import { ModelProviderService } from './model-provider.service';
import { ModelProviderRegistryService } from './model-provider-registry.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { ProviderCapabilityService } from './provider-capability.service';

@Module({
  imports: [HttpModule],
  controllers: [ModelProviderController, PlatformCompatController],
  providers: [
    ModelProviderService,
    ModelProviderRegistryService,
    CredentialCryptoService,
    ProviderCapabilityService,
  ],
  exports: [
    ModelProviderService,
    ModelProviderRegistryService,
    CredentialCryptoService,
    ProviderCapabilityService,
  ],
})
export class ModelProviderModule {}

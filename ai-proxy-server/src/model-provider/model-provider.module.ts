import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ModelProviderController } from './model-provider.controller';
import { PlatformCompatController } from './platform-compat.controller';
import { ModelProviderService } from './model-provider.service';
import { ModelProviderRegistryService } from './model-provider-registry.service';
import { CredentialCryptoService } from './credential-crypto.service';

@Module({
  imports: [HttpModule],
  controllers: [ModelProviderController, PlatformCompatController],
  providers: [ModelProviderService, ModelProviderRegistryService, CredentialCryptoService],
  exports: [ModelProviderService, ModelProviderRegistryService, CredentialCryptoService],
})
export class ModelProviderModule {}

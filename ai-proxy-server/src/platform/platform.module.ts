import { Module } from '@nestjs/common';
import { ModelProviderModule } from '../model-provider/model-provider.module';

@Module({
  imports: [ModelProviderModule],
  exports: [ModelProviderModule],
})
export class PlatformModule {}

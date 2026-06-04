import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ModelProviderService } from './model-provider.service';
import {
  CreateModelProviderDto,
  CreateProviderCredentialDto,
  CreateProviderModelDto,
  UpdateModelProviderDto,
  UpdateProviderCredentialDto,
  UpdateProviderModelDto,
} from './dto/model-provider.dto';

@Controller('api/model-providers')
export class ModelProviderController {
  constructor(private readonly modelProviderService: ModelProviderService) {}

  @Get()
  findAll() {
    return this.modelProviderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.modelProviderService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateModelProviderDto) {
    return this.modelProviderService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModelProviderDto) {
    return this.modelProviderService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.modelProviderService.delete(id);
  }

  @Post(':id/credentials')
  createCredential(@Param('id') id: string, @Body() dto: CreateProviderCredentialDto) {
    return this.modelProviderService.createCredential(id, dto);
  }

  @Patch(':id/credentials/:credentialId')
  updateCredential(
    @Param('id') id: string,
    @Param('credentialId') credentialId: string,
    @Body() dto: UpdateProviderCredentialDto,
  ) {
    return this.modelProviderService.updateCredential(id, credentialId, dto);
  }

  @Post(':id/credentials/:credentialId/default')
  @HttpCode(HttpStatus.OK)
  setDefaultCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    return this.modelProviderService.setDefaultCredential(id, credentialId);
  }

  @Post(':id/credentials/:credentialId/validate')
  @HttpCode(HttpStatus.OK)
  validateCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    return this.modelProviderService.validateCredential(id, credentialId);
  }

  @Delete(':id/credentials/:credentialId')
  @HttpCode(HttpStatus.OK)
  removeCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    return this.modelProviderService.deleteCredential(id, credentialId);
  }

  @Post(':id/models')
  createModel(@Param('id') id: string, @Body() dto: CreateProviderModelDto) {
    return this.modelProviderService.createModel(id, dto);
  }

  @Patch(':id/models/:modelId')
  updateModel(
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body() dto: UpdateProviderModelDto,
  ) {
    return this.modelProviderService.updateModel(id, modelId, dto);
  }

  @Post(':id/models/:modelId/default')
  @HttpCode(HttpStatus.OK)
  setDefaultModel(@Param('id') id: string, @Param('modelId') modelId: string) {
    return this.modelProviderService.setDefaultModel(id, modelId);
  }

  @Delete(':id/models/:modelId')
  @HttpCode(HttpStatus.OK)
  removeModel(@Param('id') id: string, @Param('modelId') modelId: string) {
    return this.modelProviderService.deleteModel(id, modelId);
  }
}

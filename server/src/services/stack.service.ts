import { BadRequestException, Injectable } from '@nestjs/common';
import { BulkIdsDto } from 'src/dtos/asset-ids.response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { StackCreateDto, StackResponseDto, StackSearchDto, StackUpdateDto, mapStack } from 'src/dtos/stack.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { UUIDAssetIDParamDto } from 'src/validation';

@Injectable()
export class StackService extends BaseService {
  async search(auth: AuthDto, dto: StackSearchDto): Promise<StackResponseDto[]> {
    const stacks = await this.stackRepository.search({
      ownerId: auth.user.id,
      primaryAssetId: dto.primaryAssetId,
    });

    return stacks.map((stack) => mapStack(stack, { auth }));
  }

  async create(auth: AuthDto, dto: StackCreateDto): Promise<StackResponseDto> {
    await this.requireAccess({ auth, permission: Permission.AssetUpdate, ids: dto.assetIds });

    const stack = await this.stackRepository.create({ ownerId: auth.user.id }, dto.assetIds);

    await this.eventRepository.emit('StackCreate', { stackId: stack.id, userId: auth.user.id });

    return mapStack(stack, { auth });
  }

  async get(auth: AuthDto, id: string): Promise<StackResponseDto> {
    await this.requireAccess({ auth, permission: Permission.StackRead, ids: [id] });
    const stack = await this.findOrFail(id);
    return mapStack(stack, { auth });
  }

  async update(auth: AuthDto, id: string, dto: StackUpdateDto): Promise<StackResponseDto> {
    await this.requireAccess({ auth, permission: Permission.StackUpdate, ids: [id] });
    const stack = await this.findOrFail(id);
    if (dto.primaryAssetId && !stack.assets.some(({ id }) => id === dto.primaryAssetId)) {
      throw new BadRequestException('Primary asset must be in the stack');
    }

    const updatedStack = await this.stackRepository.update(id, { id, primaryAssetId: dto.primaryAssetId });

    await this.eventRepository.emit('StackUpdate', { stackId: id, userId: auth.user.id });

    return mapStack(updatedStack, { auth });
  }

  async delete(auth: AuthDto, id: string): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.StackDelete, ids: [id] });
    await this.stackRepository.delete(id);
    await this.eventRepository.emit('StackDelete', { stackId: id, userId: auth.user.id });
  }

  async deleteAll(auth: AuthDto, dto: BulkIdsDto): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.StackDelete, ids: dto.ids });
    await this.stackRepository.deleteAll(dto.ids);
    await this.eventRepository.emit('StackDeleteAll', { stackIds: dto.ids, userId: auth.user.id });
  }

  async removeAsset(auth: AuthDto, dto: UUIDAssetIDParamDto): Promise<void> {
    const { id: stackId, assetId } = dto;
    await this.requireAccess({ auth, permission: Permission.StackUpdate, ids: [stackId] });

    const stack = await this.stackRepository.getForAssetRemoval(assetId);

    if (!stack?.id || stack.id !== stackId) {
      throw new BadRequestException('Asset not in stack');
    }

    if (stack.primaryAssetId === assetId) {
      throw new BadRequestException("Cannot remove stack's primary asset");
    }

    await this.assetRepository.update({ id: assetId, stackId: null });
    await this.eventRepository.emit('StackUpdate', { stackId, userId: auth.user.id });
  }

  private async findOrFail(id: string) {
    const stack = await this.stackRepository.getById(id);
    if (!stack) {
      throw new Error('Asset stack not found');
    }

    return stack;
  }
}

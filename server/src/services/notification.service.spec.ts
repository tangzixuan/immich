import { plainToInstance } from 'class-transformer';
import { defaults, SystemConfig } from 'src/config';
import { AlbumUser } from 'src/database';
import { SystemConfigDto } from 'src/dtos/system-config.dto';
import { AssetFileType, JobName, JobStatus, UserMetadataKey } from 'src/enum';
import { NotificationService } from 'src/services/notification.service';
import { INotifyAlbumUpdateJob } from 'src/types';
import { albumStub } from 'test/fixtures/album.stub';
import { assetStub } from 'test/fixtures/asset.stub';
import { userStub } from 'test/fixtures/user.stub';
import { newTestService, ServiceMocks } from 'test/utils';

const configs = {
  smtpDisabled: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: false,
      },
    },
  }),
  smtpEnabled: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: true,
      },
    },
  }),
  smtpTransport: Object.freeze<SystemConfig>({
    ...defaults,
    notifications: {
      smtp: {
        ...defaults.notifications.smtp,
        enabled: true,
        transport: {
          ignoreCert: false,
          host: 'localhost',
          port: 587,
          username: 'test',
          password: 'test',
        },
      },
    },
  }),
};

describe(NotificationService.name, () => {
  let sut: NotificationService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(NotificationService));
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('onConfigUpdate', () => {
    it('should emit client and server events', () => {
      const update = { oldConfig: defaults, newConfig: defaults };
      expect(sut.onConfigUpdate(update)).toBeUndefined();
      expect(mocks.event.clientBroadcast).toHaveBeenCalledWith('on_config_update');
      expect(mocks.event.serverSend).toHaveBeenCalledWith('ConfigUpdate', update);
    });
  });

  describe('onConfigValidateEvent', () => {
    it('validates smtp config when enabling smtp', async () => {
      const oldConfig = configs.smtpDisabled;
      const newConfig = configs.smtpEnabled;

      mocks.email.verifySmtp.mockResolvedValue(true);
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).toHaveBeenCalledWith(newConfig.notifications.smtp.transport);
    });

    it('validates smtp config when transport changes', async () => {
      const oldConfig = configs.smtpEnabled;
      const newConfig = configs.smtpTransport;

      mocks.email.verifySmtp.mockResolvedValue(true);
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).toHaveBeenCalledWith(newConfig.notifications.smtp.transport);
    });

    it('skips smtp validation when there are no changes', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = { ...configs.smtpEnabled };

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('skips smtp validation with DTO when there are no changes', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = plainToInstance(SystemConfigDto, configs.smtpEnabled);

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('skips smtp validation when smtp is disabled', async () => {
      const oldConfig = { ...configs.smtpEnabled };
      const newConfig = { ...configs.smtpDisabled };

      await expect(sut.onConfigValidate({ oldConfig, newConfig })).resolves.not.toThrow();
      expect(mocks.email.verifySmtp).not.toHaveBeenCalled();
    });

    it('should fail if smtp configuration is invalid', async () => {
      const oldConfig = configs.smtpDisabled;
      const newConfig = configs.smtpEnabled;

      mocks.email.verifySmtp.mockRejectedValue(new Error('Failed validating smtp'));
      await expect(sut.onConfigValidate({ oldConfig, newConfig })).rejects.toBeInstanceOf(Error);
    });
  });

  describe('onAssetHide', () => {
    it('should send connected clients an event', () => {
      sut.onAssetHide({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_hidden', 'user-id', 'asset-id');
    });
  });

  describe('onAssetShow', () => {
    it('should queue the generate thumbnail job', async () => {
      await sut.onAssetShow({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.AssetGenerateThumbnails,
        data: { id: 'asset-id', notify: true },
      });
    });
  });

  describe('onUserSignupEvent', () => {
    it('skips when notify is false', async () => {
      await sut.onUserSignup({ id: '', notify: false });
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });

    it('should queue notify signup event if notify is true', async () => {
      await sut.onUserSignup({ id: '', notify: true });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyUserSignup,
        data: { id: '', tempPassword: undefined },
      });
    });
  });

  describe('onAlbumUpdateEvent', () => {
    it('should queue notify album update event', async () => {
      await sut.onAlbumUpdate({ id: 'album', recipientId: '42' });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAlbumUpdate,
        data: { id: 'album', recipientId: '42', delay: 300_000 },
      });
    });
  });

  describe('onAlbumInviteEvent', () => {
    it('should queue notify album invite event', async () => {
      await sut.onAlbumInvite({ id: '', userId: '42' });
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAlbumInvite,
        data: { id: '', recipientId: '42' },
      });
    });
  });

  describe('onSessionDeleteEvent', () => {
    it('should send a on_session_delete client event', () => {
      vi.useFakeTimers();
      sut.onSessionDelete({ sessionId: 'id' });
      expect(mocks.event.clientSend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_session_delete', 'id', 'id');
    });
  });

  describe('onAssetTrash', () => {
    it('should send connected clients an event', () => {
      sut.onAssetTrash({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_trash', 'user-id', ['asset-id']);
    });
  });

  describe('onAssetDelete', () => {
    it('should send connected clients an event', () => {
      sut.onAssetDelete({ assetId: 'asset-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_delete', 'user-id', 'asset-id');
    });
  });

  describe('onAssetsTrash', () => {
    it('should send connected clients an event', () => {
      sut.onAssetsTrash({ assetIds: ['asset-id'], userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_trash', 'user-id', ['asset-id']);
    });
  });

  describe('onAssetsRestore', () => {
    it('should send connected clients an event', () => {
      sut.onAssetsRestore({ assetIds: ['asset-id'], userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_restore', 'user-id', ['asset-id']);
    });
  });

  describe('onStackCreate', () => {
    it('should send connected clients an event', () => {
      sut.onStackCreate({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStackUpdate', () => {
    it('should send connected clients an event', () => {
      sut.onStackUpdate({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStackDelete', () => {
    it('should send connected clients an event', () => {
      sut.onStackDelete({ stackId: 'stack-id', userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('onStacksDelete', () => {
    it('should send connected clients an event', () => {
      sut.onStacksDelete({ stackIds: ['stack-id'], userId: 'user-id' });
      expect(mocks.event.clientSend).toHaveBeenCalledWith('on_asset_stack_update', 'user-id');
    });
  });

  describe('handleUserSignup', () => {
    it('should skip if user could not be found', async () => {
      await expect(sut.handleUserSignup({ id: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should be successful', async () => {
      mocks.user.get.mockResolvedValue(userStub.admin);
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });

      await expect(sut.handleUserSignup({ id: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({ subject: 'Welcome to Immich' }),
      });
    });
  });

  describe('handleAlbumInvite', () => {
    it('should skip if album could not be found', async () => {
      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.user.get).not.toHaveBeenCalled();
    });

    it('should skip if recipient could not be found', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.empty);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.job.queue).not.toHaveBeenCalled();
    });

    it('should skip if the recipient has email notifications disabled', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.empty);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: false, albumInvite: true } },
          },
        ],
      });

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should skip if the recipient has email notifications for album invite disabled', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.empty);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: false } },
          },
        ],
      });

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should send invite email', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.empty);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({ subject: expect.stringContaining('You have been added to a shared album') }),
      });
    });

    it('should send invite email without album thumbnail if thumbnail asset does not exist', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.emptyWithValidThumbnail);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        albumStub.emptyWithValidThumbnail.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: undefined,
        }),
      });
    });

    it('should send invite email with album thumbnail as jpeg', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.emptyWithValidThumbnail);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([
        { id: '1', type: AssetFileType.Thumbnail, path: 'path-to-thumb.jpg' },
      ]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        albumStub.emptyWithValidThumbnail.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: [{ filename: 'album-thumbnail.jpg', path: expect.anything(), cid: expect.anything() }],
        }),
      });
    });

    it('should send invite email with album thumbnail and arbitrary extension', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.emptyWithValidThumbnail);
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumInvite: true } },
          },
        ],
      });
      mocks.systemMetadata.get.mockResolvedValue({ server: {} });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([assetStub.image.files[2]]);

      await expect(sut.handleAlbumInvite({ id: '', recipientId: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.assetJob.getAlbumThumbnailFiles).toHaveBeenCalledWith(
        albumStub.emptyWithValidThumbnail.albumThumbnailAssetId,
        AssetFileType.Thumbnail,
      );
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.SendMail,
        data: expect.objectContaining({
          subject: expect.stringContaining('You have been added to a shared album'),
          imageAttachments: [{ filename: 'album-thumbnail.ext', path: expect.anything(), cid: expect.anything() }],
        }),
      });
    });
  });

  describe('handleAlbumUpdate', () => {
    it('should skip if album could not be found', async () => {
      await expect(sut.handleAlbumUpdate({ id: '', recipientId: '1' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.user.get).not.toHaveBeenCalled();
    });

    it('should skip if owner could not be found', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.emptyWithValidThumbnail);

      await expect(sut.handleAlbumUpdate({ id: '', recipientId: '1' })).resolves.toBe(JobStatus.Skipped);
      expect(mocks.systemMetadata.get).not.toHaveBeenCalled();
    });

    it('should skip recipient that could not be looked up', async () => {
      mocks.album.getById.mockResolvedValue({
        ...albumStub.emptyWithValidThumbnail,
        albumUsers: [{ user: { id: userStub.user1.id } } as AlbumUser],
      });
      mocks.user.get.mockResolvedValueOnce(userStub.user1);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: userStub.user1.id });
      expect(mocks.user.get).toHaveBeenCalledWith(userStub.user1.id, { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should skip recipient with disabled email notifications', async () => {
      mocks.album.getById.mockResolvedValue({
        ...albumStub.emptyWithValidThumbnail,
        albumUsers: [{ user: { id: userStub.user1.id } } as AlbumUser],
      });
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: false, albumUpdate: true } },
          },
        ],
      });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: userStub.user1.id });
      expect(mocks.user.get).toHaveBeenCalledWith(userStub.user1.id, { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should skip recipient with disabled email notifications for the album update event', async () => {
      mocks.album.getById.mockResolvedValue({
        ...albumStub.emptyWithValidThumbnail,
        albumUsers: [{ user: { id: userStub.user1.id } } as AlbumUser],
      });
      mocks.user.get.mockResolvedValue({
        ...userStub.user1,
        metadata: [
          {
            key: UserMetadataKey.Preferences,
            value: { emailNotifications: { enabled: true, albumUpdate: false } },
          },
        ],
      });
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: userStub.user1.id });
      expect(mocks.user.get).toHaveBeenCalledWith(userStub.user1.id, { withDeleted: false });
      expect(mocks.email.renderEmail).not.toHaveBeenCalled();
    });

    it('should send email', async () => {
      mocks.album.getById.mockResolvedValue({
        ...albumStub.emptyWithValidThumbnail,
        albumUsers: [{ user: { id: userStub.user1.id } } as AlbumUser],
      });
      mocks.user.get.mockResolvedValue(userStub.user1);
      mocks.email.renderEmail.mockResolvedValue({ html: '', text: '' });
      mocks.assetJob.getAlbumThumbnailFiles.mockResolvedValue([]);

      await sut.handleAlbumUpdate({ id: '', recipientId: userStub.user1.id });
      expect(mocks.user.get).toHaveBeenCalledWith(userStub.user1.id, { withDeleted: false });
      expect(mocks.email.renderEmail).toHaveBeenCalled();
      expect(mocks.job.queue).toHaveBeenCalled();
    });

    it('should add new recipients for new images if job is already queued', async () => {
      await sut.onAlbumUpdate({ id: '1', recipientId: '2' } as INotifyAlbumUpdateJob);
      expect(mocks.job.removeJob).toHaveBeenCalledWith(JobName.NotifyAlbumUpdate, '1/2');
      expect(mocks.job.queue).toHaveBeenCalledWith({
        name: JobName.NotifyAlbumUpdate,
        data: {
          id: '1',
          delay: 300_000,
          recipientId: '2',
        },
      });
    });
  });

  describe('handleSendEmail', () => {
    it('should skip if smtp notifications are disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue({ notifications: { smtp: { enabled: false } } });
      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Skipped);
    });

    it('should send mail successfully', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        notifications: { smtp: { enabled: true, from: 'test@immich.app' } },
      });
      mocks.email.sendEmail.mockResolvedValue({ messageId: '', response: '' });

      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'test@immich.app' }));
    });

    it('should send mail with replyTo successfully', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        notifications: { smtp: { enabled: true, from: 'test@immich.app', replyTo: 'demo@immich.app' } },
      });
      mocks.email.sendEmail.mockResolvedValue({ messageId: '', response: '' });

      await expect(sut.handleSendEmail({ html: '', subject: '', text: '', to: '' })).resolves.toBe(JobStatus.Success);
      expect(mocks.email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'demo@immich.app' }));
    });
  });
});

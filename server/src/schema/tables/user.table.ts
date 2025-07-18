import { ColumnType } from 'kysely';
import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { UserAvatarColor, UserStatus } from 'src/enum';
import { user_delete_audit } from 'src/schema/functions';
import {
  AfterDeleteTrigger,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from 'src/sql-tools';

@Table('user')
@UpdatedAtTrigger('user_updatedAt')
@AfterDeleteTrigger({
  scope: 'statement',
  function: user_delete_audit,
  referencingOldTableAs: 'old',
  when: 'pg_trigger_depth() = 0',
})
@Index({ columns: ['updatedAt', 'id'] })
export class UserTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @Column({ unique: true })
  email!: string;

  @Column({ default: '' })
  password!: Generated<string>;

  @Column({ nullable: true })
  pinCode!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @Column({ default: '' })
  profileImagePath!: Generated<string>;

  @Column({ type: 'boolean', default: false })
  isAdmin!: Generated<boolean>;

  @Column({ type: 'boolean', default: true })
  shouldChangePassword!: Generated<boolean>;

  @Column({ default: null })
  avatarColor!: UserAvatarColor | null;

  @DeleteDateColumn()
  deletedAt!: Timestamp | null;

  @Column({ default: '' })
  oauthId!: Generated<string>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @Column({ unique: true, nullable: true, default: null })
  storageLabel!: string | null;

  @Column({ default: '' })
  name!: Generated<string>;

  @Column({ type: 'bigint', nullable: true })
  quotaSizeInBytes!: ColumnType<number> | null;

  @Column({ type: 'bigint', default: 0 })
  quotaUsageInBytes!: Generated<ColumnType<number>>;

  @Column({ type: 'character varying', default: UserStatus.Active })
  status!: Generated<UserStatus>;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  profileChangedAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}

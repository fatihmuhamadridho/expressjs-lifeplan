import type { Collection, Db, Document } from 'mongodb';
import {
  VisionRepository,
  type Vision,
  type VisionInput,
  type WishlistInput,
  type WishlistItem,
  type WishlistUpdateInput,
} from '../application/vision.repository';

type WishlistDocument = WishlistItem;
type VisionDocument = Document &
  VisionInput & {
    _id: string;
    userId: string;
    wishlist: WishlistDocument[];
    createdAt: Date;
    updatedAt: Date;
  };

function mapVision(document: VisionDocument): Vision {
  const { _id, userId: _userId, wishlist: _wishlist, ...vision } = document;
  return { ...vision, id: _id };
}

export class VisionRepositoryImpl extends VisionRepository {
  private readonly visions: Collection<VisionDocument>;

  constructor(database: Db) {
    super();
    this.visions = database.collection<VisionDocument>('visions');
  }

  async find(userId: string): Promise<Vision | null> {
    const document = await this.visions.findOne({ userId });
    return document ? mapVision(document) : null;
  }

  async save(userId: string, input: VisionInput): Promise<Vision> {
    const now = new Date();
    const document = await this.visions.findOneAndUpdate(
      { userId },
      {
        $set: { ...input, updatedAt: now },
        $setOnInsert: { _id: crypto.randomUUID(), userId, wishlist: [], createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );
    if (!document) throw new Error('Vision could not be saved.');
    return mapVision(document);
  }

  async listWishlist(userId: string): Promise<WishlistItem[]> {
    const vision = await this.visions.findOne({ userId }, { projection: { wishlist: 1 } });
    return vision?.wishlist ?? [];
  }

  async createWishlistItem(userId: string, input: WishlistInput): Promise<WishlistItem | null> {
    const now = new Date();
    const item: WishlistItem = {
      id: crypto.randomUUID(),
      ...input,
      checked: false,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.visions.updateOne({ userId }, {
      $push: { wishlist: item },
      $set: { updatedAt: now },
    } as Document);
    return result.matchedCount ? item : null;
  }

  async updateWishlistItem(userId: string, id: string, input: WishlistUpdateInput): Promise<WishlistItem | null> {
    const now = new Date();
    const updates: Record<string, unknown> = { 'wishlist.$[item].updatedAt': now, updatedAt: now };
    if (input.text !== undefined) updates['wishlist.$[item].text'] = input.text;
    if (input.checked !== undefined) updates['wishlist.$[item].checked'] = input.checked;
    const document = await this.visions.findOneAndUpdate(
      { userId, 'wishlist.id': id },
      { $set: updates },
      { arrayFilters: [{ 'item.id': id }], returnDocument: 'after' }
    );
    return document?.wishlist.find((item) => item.id === id) ?? null;
  }

  async deleteWishlistItem(userId: string, id: string): Promise<boolean> {
    const result = await this.visions.updateOne({ userId, 'wishlist.id': id }, {
      $pull: { wishlist: { id } },
      $set: { updatedAt: new Date() },
    } as Document);
    return result.modifiedCount > 0;
  }
}

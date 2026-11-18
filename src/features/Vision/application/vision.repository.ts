export type VisionInput = {
  title: string;
  description: string;
  targetAge: number;
  targetYear: number;
  style: string;
};

export type Vision = VisionInput & { id: string; createdAt: Date; updatedAt: Date };
export type WishlistItem = { id: string; text: string; checked: boolean; createdAt: Date; updatedAt: Date };
export type WishlistInput = { text: string };
export type WishlistUpdateInput = Partial<WishlistInput> & { checked?: boolean };

export abstract class VisionRepository {
  abstract find(userId: string): Promise<Vision | null>;
  abstract save(userId: string, input: VisionInput): Promise<Vision>;
  abstract listWishlist(userId: string): Promise<WishlistItem[]>;
  abstract createWishlistItem(userId: string, input: WishlistInput): Promise<WishlistItem | null>;
  abstract updateWishlistItem(userId: string, id: string, input: WishlistUpdateInput): Promise<WishlistItem | null>;
  abstract deleteWishlistItem(userId: string, id: string): Promise<boolean>;
}

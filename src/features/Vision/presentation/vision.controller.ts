import type { Response } from 'express';
import type { AuthenticatedRequest } from '@common/middlewares/auth.middleware';
import { fail, numberField, objectBody, stringField } from '@common/utils/api';
import type {
  VisionInput,
  VisionRepository,
  WishlistInput,
  WishlistUpdateInput,
} from '../application/vision.repository';

function parseVision(input: unknown): VisionInput {
  const body = objectBody(input);
  const title = stringField(body, 'title', { required: true, max: 60 }) as string;
  const description = stringField(body, 'description', { required: true, max: 280 }) as string;
  const targetAge = numberField(body, 'targetAge', { required: true, min: 1, max: 120 }) as number;
  const targetYear = numberField(body, 'targetYear', { required: true, min: 1900, max: 9999 }) as number;
  const style = stringField(body, 'style', { required: true, max: 80 }) as string;
  if (!Number.isSafeInteger(targetAge)) fail(400, 'invalid_field', 'targetAge must be a whole number.');
  if (!Number.isSafeInteger(targetYear)) fail(400, 'invalid_field', 'targetYear must be a whole number.');
  if (!['Horizon Line', 'Sunrise', 'Minimal Gradient'].includes(style))
    fail(400, 'invalid_field', 'style must be Horizon Line, Sunrise, or Minimal Gradient.');
  return { title, description, targetAge, targetYear, style };
}

function parseWishlistItem(input: unknown, partial = false): WishlistInput | WishlistUpdateInput {
  const body = objectBody(input);
  const result: WishlistUpdateInput = {};
  if (!partial || body.text !== undefined)
    result.text = stringField(body, 'text', { required: true, max: 200 }) as string;
  if (body.checked !== undefined) {
    if (typeof body.checked !== 'boolean') fail(400, 'invalid_field', 'checked must be a boolean.');
    result.checked = body.checked;
  }
  if (partial && Object.keys(result).length === 0)
    fail(400, 'empty_patch', 'Provide text or checked to update the wishlist item.');
  return result;
}

export class VisionController {
  constructor(private readonly visionRepository: VisionRepository) {}

  async handleGet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const vision = await this.visionRepository.find(req.userId);
    res.json({ data: vision });
  }

  async handleSave(req: AuthenticatedRequest, res: Response): Promise<void> {
    const vision = await this.visionRepository.save(req.userId, parseVision(req.body));
    res.json({ data: vision });
  }

  async handleListWishlist(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json({ data: await this.visionRepository.listWishlist(req.userId) });
  }

  async handleCreateWishlistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.visionRepository.createWishlistItem(
      req.userId,
      parseWishlistItem(req.body) as WishlistInput
    );
    if (!item) fail(404, 'vision_not_found', 'Save your vision before adding wishlist items.');
    res.status(201).location(`/api/v1/vision/wishlist/${item.id}`).json({ data: item });
  }

  async handleUpdateWishlistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const item = await this.visionRepository.updateWishlistItem(
      req.userId,
      String(req.params.id),
      parseWishlistItem(req.body, true) as WishlistUpdateInput
    );
    if (!item) fail(404, 'not_found', 'Wishlist item was not found.');
    res.json({ data: item });
  }

  async handleDeleteWishlistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!(await this.visionRepository.deleteWishlistItem(req.userId, String(req.params.id))))
      fail(404, 'not_found', 'Wishlist item was not found.');
    res.status(204).end();
  }
}

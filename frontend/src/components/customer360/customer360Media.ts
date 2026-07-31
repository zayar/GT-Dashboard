export interface Customer360MediaAttachment {
  id: string;
  name: string;
  mimeType?: string | null;
  kind: string;
  url: string;
  sizeBytes?: number | null;
}

const RENDERABLE_IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

const attachmentPath = (attachment: Customer360MediaAttachment): string => {
  try {
    return decodeURIComponent(new URL(attachment.url).pathname);
  } catch {
    return attachment.url.split(/[?#]/, 1)[0];
  }
};

export const isCustomer360Image = (attachment: Customer360MediaAttachment): boolean => (
  attachment.kind.toUpperCase() === 'PHOTO'
  || attachment.mimeType?.toLowerCase().startsWith('image/') === true
  || RENDERABLE_IMAGE_EXTENSION.test(attachmentPath(attachment))
);

export const getCustomer360Images = <T extends Customer360MediaAttachment>(attachments: T[]): T[] => (
  attachments.filter(isCustomer360Image)
);

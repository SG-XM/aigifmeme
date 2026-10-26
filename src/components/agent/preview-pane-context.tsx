import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface PreviewMedia {
  src: string;
  alt?: string;
  name?: string;
}

interface PreviewPaneState {
  open: boolean;
  setOpen: (v: boolean) => void;
  image: PreviewMedia | null;
  images: PreviewMedia[];
  setImages: (images: PreviewMedia[]) => void;
  openMedia: (image: PreviewMedia) => void;
  clearMedia: () => void;
}

const PreviewPaneCtx = createContext<PreviewPaneState | null>(null);

export function PreviewPaneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<PreviewMedia | null>(null);
  const [images, setImages] = useState<PreviewMedia[]>([]);
  const openMedia = useCallback((nextImage: PreviewMedia) => {
    setImage(nextImage);
    setOpen(true);
  }, []);
  const clearMedia = useCallback(() => setImage(null), []);
  const value = useMemo(
    () => ({ open, setOpen, image, images, setImages, openMedia, clearMedia }),
    [open, image, images, openMedia, clearMedia]
  );
  return (
    <PreviewPaneCtx.Provider value={value}>{children}</PreviewPaneCtx.Provider>
  );
}

export function usePreviewPane(): PreviewPaneState {
  return (
    useContext(PreviewPaneCtx) ?? {
      open: false,
      setOpen: () => {},
      image: null,
      images: [],
      setImages: () => {},
      openMedia: () => {},
      clearMedia: () => {},
    }
  );
}

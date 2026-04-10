import React, { useState } from 'react';

interface ImagePickerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}

const IMAGES = [
  'https://raw.githubusercontent.com/mee-nam-lee/gemini-enterprise-lab/refs/heads/main/static/aspect/banner1.png',
  'https://raw.githubusercontent.com/mee-nam-lee/gemini-enterprise-lab/refs/heads/main/static/aspect/banner2.png',
  'https://raw.githubusercontent.com/mee-nam-lee/gemini-enterprise-lab/refs/heads/main/static/aspect/banner3.png',
  'https://raw.githubusercontent.com/mee-nam-lee/gemini-enterprise-lab/refs/heads/main/static/aspect/banner4.png',
  'https://raw.githubusercontent.com/mee-nam-lee/gemini-enterprise-lab/refs/heads/main/static/aspect/banner5.png',
];

const ImagePickerPopup: React.FC<ImagePickerPopupProps> = ({ isOpen, onClose, onSelect }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelect = () => {
    if (previewImage) {
      onSelect(previewImage);
      setPreviewImage(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] text-white border border-white/10 rounded-3xl p-6 w-11/12 max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-tight">Select Banner Image</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {previewImage ? (
          <div className="flex flex-col items-center">
            <div className="mb-6 max-h-[60vh] overflow-hidden rounded-xl border border-white/10">
              <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setPreviewImage(null)}
                className="px-4 py-2 bg-white/5 text-white/60 rounded-xl hover:bg-white/10 hover:text-white transition-colors"
              >
                Back to Gallery
              </button>
              <button
                onClick={handleSelect}
                className="px-4 py-2 bg-white text-black rounded-xl hover:bg-white/90 transition-colors font-semibold"
              >
                Select Image
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {IMAGES.map((url, index) => (
              <div
                key={index}
                className="border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-white/30 transition-colors bg-white/5 flex items-center justify-center group"
                onClick={() => setPreviewImage(url)}
              >
                <img src={url} alt={`Option ${index + 1}`} className="w-full h-32 object-contain group-hover:scale-105 transition-transform" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePickerPopup;

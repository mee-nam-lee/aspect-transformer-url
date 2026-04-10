/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Upload, Image as ImageIcon, RefreshCw, Check, AlertCircle, Key, Maximize2 } from "lucide-react";
import ImagePickerPopup from './components/ImagePickerPopup';

// Supported aspect ratios for UI
const ALL_ASPECT_RATIOS = [
  "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1", "21:9"
] as const;

// Mapping to gemini-3.1-flash-image-preview supported API values
const API_RATIO_MAP: Record<string, string> = {
  "1:1": "1:1",
  "3:2": "4:3",
  "2:3": "3:4",
  "3:4": "3:4",
  "4:3": "4:3",
  "4:5": "3:4",
  "5:4": "4:3",
  "9:16": "9:16",
  "16:9": "16:9",
  "1:4": "1:4",
  "4:1": "4:1",
  "1:8": "1:8",
  "8:1": "8:1",
  "21:9": "16:9"
};

type AspectRatio = typeof ALL_ASPECT_RATIOS[number];

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null);
  const [genDims, setGenDims] = useState<{ w: number; h: number } | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [popupImage, setPopupImage] = useState<string | null>(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const cancelRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const fetchAndConvertToDataUrl = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSelectFromGallery = async (imageUrl: string) => {
    try {
      const dataUrl = await fetchAndConvertToDataUrl(imageUrl);
      setSourceImage(dataUrl);
      const dims = await getImageDimensions(dataUrl);
      setSourceDims(dims);
      setGeneratedImage(null);
      setGenDims(null);
      setError(null);
    } catch (e: any) {
      setError(`Failed to load image from gallery: ${e.message}`);
    }
  };

  const handleClearImage = () => {
    setSourceImage(null);
    setSourceDims(null);
    setGeneratedImage(null);
    setGenDims(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadingMessages = [
    "Analyzing your image structure...",
    "Calculating new dimensions...",
    "Gemini is reimagining the composition...",
    "Synthesizing pixels for the new aspect ratio...",
    "Almost there! Polishing the final result...",
  ];

  // API key check removed as it's handled by backend

  const getImageDimensions = (url: string): Promise<{ w: number; h: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.src = url;
    });
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        setSourceImage(dataUrl);
        const dims = await getImageDimensions(dataUrl);
        setSourceDims(dims);
        setGeneratedImage(null);
        setGenDims(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        setSourceImage(dataUrl);
        const dims = await getImageDimensions(dataUrl);
        setSourceDims(dims);
        setGeneratedImage(null);
        setGenDims(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsGenerating(false);
  };

  const generateImage = async () => {
    if (!sourceImage) return;
    
    setIsGenerating(true);
    setError(null);
    cancelRef.current = false;
    
    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[messageIndex]);
    }, 3000);

    try {
      const apiRatio = API_RATIO_MAP[selectedRatio] || "1:1";

      const [w, h] = selectedRatio.split(':').map(Number);
      const isHorizontal = w > h;
      const isVertical = h > w;

      let layoutInstruction = "";
      if (isHorizontal) {
        layoutInstruction = "Layout Strategy (Horizontal): Position the main object on the right side of the frame. Place any existing logos or brand marks strictly in the bottom-left corner. Do NOT place logos near the main object or in the center of the composition. Focus on creating high-quality negative space on the left side to balance the composition.";
      } else if (isVertical) {
        layoutInstruction = "Layout Strategy (Vertical): Position the main object in the lower third of the frame to create a stable and professional composition. The upper portion should be a natural, high-quality extension of the background (negative space) that complements the subject without feeling excessively empty. Place logos and brand marks near the bottom edge, ensuring they don't clutter the main object. Maintain a balanced distribution of space that feels intentional and aesthetically pleasing.";
      }

      let response;
      const maxRetries = 3;
      const delay = 2000;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: sourceImage,
              aspectRatio: selectedRatio,
              apiRatio: apiRatio,
              layoutInstruction: layoutInstruction,
            }),
          });

          if (response.ok) break;

          const errorData = await response.json();
          const errorMsg = errorData.detail || "";

          if (response.status === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
            if (attempt < maxRetries - 1) {
              const waitTime = delay * Math.pow(2, attempt);
              setRetryMessage(`오류 발생(429). ${waitTime/1000}초 후 재시도 중... (${attempt + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          throw new Error(errorMsg || `HTTP error! status: ${response.status}`);
        } catch (error: any) {
          if (attempt === maxRetries - 1) throw error;
        }
      }

      const data = await response.json();
      
      if (cancelRef.current) return;

      setGeneratedImage(data.result);
      const dims = await getImageDimensions(data.result);
      setGenDims(dims);
      
    } catch (err: any) {
      if (cancelRef.current) return;
      console.error(err);
      setError(err.message || "An error occurred during generation.");
    } finally {
      clearInterval(messageInterval);
      setIsGenerating(false);
      setRetryMessage(null);
    }
  };

  const handleEditSubmit = async (mode: 'modify' | 'delete' = 'modify') => {
    if (!generatedImage) return;
    if (mode === 'modify' && !editPrompt.trim()) return;
    
    setIsEditing(true);
    setError(null);
    
    try {
      const promptText = mode === 'delete' 
        ? `Please remove the object or content described as "${editPrompt}" and seamlessly fill the background to match the surroundings.`
        : `Modify the image based on this request: "${editPrompt}". Seamlessly blend the changes with the rest of the image.`;

      let response;
      const maxRetries = 3;
      const delay = 2000;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await fetch('/api/edit-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: generatedImage,
              prompt: promptText,
            }),
          });

          if (response.ok) break;

          const errorData = await response.json();
          const errorMsg = errorData.detail || "";

          if (response.status === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
            if (attempt < maxRetries - 1) {
              const waitTime = delay * Math.pow(2, attempt);
              setRetryMessage(`오류 발생(429). ${waitTime/1000}초 후 재시도 중... (${attempt + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          throw new Error(errorMsg || `HTTP error! status: ${response.status}`);
        } catch (error: any) {
          if (attempt === maxRetries - 1) throw error;
        }
      }

      const data = await response.json();
      
      setGeneratedImage(data.result);
      const dims = await getImageDimensions(data.result);
      setGenDims(dims);
      setEditPrompt("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during editing.");
    } finally {
      setIsEditing(false);
      setRetryMessage(null);
    }
  };



  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#1a1a1a] border border-white/10 rounded-3xl p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Key className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold mb-4 tracking-tight">API Key Required</h1>
          <p className="text-white/60 mb-8 leading-relaxed">
            To use Gemini 3.1 Flash Image Preview, you need to select a paid API key from your Google Cloud project.
          </p>
          <button
            onClick={handleOpenKeyDialog}
            className="w-full py-4 bg-white text-black rounded-xl font-semibold hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
          >
            Select API Key
          </button>
          <p className="mt-6 text-xs text-white/40">
            Learn more about <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">Gemini API billing</a>.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-white/20">
      {/* Header */}
      <header className="border-bottom border-white/10 py-6 px-8 flex justify-between items-center sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <Maximize2 className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Aspect Transformer</h1>
        </div>

      </header>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-8">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40">1. Upload Image</h2>
              {sourceDims && (
                <span className="text-[10px] font-mono text-white/30">{sourceDims.w} × {sourceDims.h} px</span>
              )}
            </div>
            
            {sourceImage && (
              <div className="flex gap-2 mb-3">
                <button 
                  onClick={handleClearImage}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  이미지 변경
                </button>
                <button 
                  onClick={() => setPopupImage(sourceImage)}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-3 h-3" />
                  이미지 보기
                </button>
              </div>
            )}

            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`
                relative group rounded-3xl p-2 transition-all duration-300 overflow-hidden
                ${sourceImage ? 'border border-white/10 bg-white/5' : 'border-2 border-dashed border-white/10'}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                className="hidden" 
                accept="image/*"
              />
              
              {sourceImage ? (
                <div className="flex justify-center items-center py-2">
                  <div className="relative w-64 h-64 rounded-lg overflow-hidden border border-white/20">
                    <img src={sourceImage} alt="Source" className="w-full h-full object-contain bg-black" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Check className="w-10 h-10 text-white" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-4">
                    <Upload className="text-white/40 w-6 h-6" />
                  </div>
                  <p className="text-white/60 font-medium mb-4">Drop image here or</p>
                  <div className="flex gap-2">
                    <button
                      onClick={triggerUpload}
                      className="px-4 py-2 bg-white text-black rounded-lg text-xs font-medium hover:bg-white/90 transition-colors"
                    >
                      Upload File
                    </button>
                    <button
                      onClick={() => setIsPickerOpen(true)}
                      className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-medium hover:bg-white/20 transition-colors"
                    >
                      Select File
                    </button>
                  </div>
                  <p className="text-white/30 text-[10px] mt-4">Supports JPG, PNG, WEBP</p>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-4">2. Select Aspect Ratio</h2>
            
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2">Square & Horizontal (가로형)</p>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_ASPECT_RATIOS.filter(r => {
                    const [w, h] = r.split(':').map(Number);
                    return w >= h;
                  }).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setSelectedRatio(ratio)}
                      className={`
                        py-2 rounded-lg text-[12px] font-medium transition-all border
                        ${selectedRatio === ratio 
                          ? 'bg-white text-black border-white' 
                          : 'bg-transparent text-white/60 border-white/10 hover:border-white/30'}
                      `}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2">Vertical (세로형)</p>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_ASPECT_RATIOS.filter(r => {
                    const [w, h] = r.split(':').map(Number);
                    return w < h;
                  }).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setSelectedRatio(ratio)}
                      className={`
                        py-2 rounded-lg text-[12px] font-medium transition-all border
                        ${selectedRatio === ratio 
                          ? 'bg-white text-black border-white' 
                          : 'bg-transparent text-white/60 border-white/10 hover:border-white/30'}
                      `}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <button
            onClick={generateImage}
            disabled={!sourceImage || isGenerating}
            className={`
              w-full py-5 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3
              ${!sourceImage || isGenerating 
                ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                : 'bg-white text-black hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/10'}
            `}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin" />
                Transforming...
              </>
            ) : (
              <>
                <ImageIcon className="w-6 h-6" />
                Generate Transformation
              </>
            )}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </div>

        {/* Right Column: Result */}
        <div className="lg:col-span-8 flex flex-col">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/40 mb-4">Result</h2>
          <div className="flex-1 bg-[#151515] rounded-[2.5rem] border border-white/5 overflow-hidden relative flex items-center justify-center min-h-[500px] p-8">
            <AnimatePresence mode="wait">
              {(isGenerating || isEditing) ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-6 text-center"
                >
                  <div className="relative">
                    <div className="w-24 h-24 border-4 border-white/10 rounded-full animate-pulse" />
                    <div className="absolute inset-0 border-t-4 border-white rounded-full animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-medium text-white">{retryMessage || loadingMessage}</p>
                    <p className="text-white/40 text-sm">Gemini 3.1 Flash is processing your request</p>
                  </div>
                  <button 
                    onClick={handleCancel}
                    className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium transition-all text-white/60 hover:text-white"
                  >
                    요청 중지 (Cancel)
                  </button>
                </motion.div>
              ) : generatedImage ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`w-full h-full flex ${(() => {
                    const [w, h] = selectedRatio.split(':').map(Number);
                    return (h > w && showEditPanel) ? 'flex-row' : 'flex-col';
                  })()} items-center justify-center gap-8`}
                >
                  <div className="flex flex-col items-center justify-center gap-4 flex-1 max-w-full">
                    <div 
                      className="relative group max-w-full select-none"
                    >
                      <img 
                        key={generatedImage}
                        ref={imageRef}
                        src={generatedImage} 
                        alt="Generated" 
                        className="max-w-full max-h-[65vh] rounded-2xl border border-white/10 shadow-2xl object-contain cursor-zoom-in"
                        referrerPolicy="no-referrer"
                        onClick={() => setPopupImage(generatedImage)}
                      />

                      <a 
                        href={generatedImage} 
                        download={`transformed-${selectedRatio.replace(':', '-')}.png`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-4 right-4 bg-white text-black p-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/90 shadow-lg z-10"
                      >
                        <Upload className="w-5 h-5 rotate-180" />
                      </a>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">Transformed Result ({selectedRatio})</p>
                      <p className="text-xs font-mono text-white/40">{genDims?.w} × {genDims?.h} px</p>
                      <div className="flex gap-3 mt-2">
                        <a 
                          href={generatedImage} 
                          download={`transformed-${selectedRatio.replace(':', '-')}.png`}
                          className="px-6 py-2.5 bg-white text-black rounded-xl font-semibold hover:bg-white/90 transition-all flex items-center gap-2 shadow-lg"
                        >
                          <Upload className="w-4 h-4 rotate-180" />
                          이미지 다운로드
                        </a>
                        <button 
                          onClick={() => setShowEditPanel(!showEditPanel)}
                          className={`px-6 py-2.5 border rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg ${showEditPanel ? 'bg-white text-black border-white' : 'bg-white/10 hover:bg-white/20 border-white/10'}`}
                        >
                          <RefreshCw className={`w-4 h-4 ${showEditPanel ? 'rotate-180' : ''} transition-transform`} />
                          {showEditPanel ? '수정창 닫기' : '이미지 수정 (Edit)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {showEditPanel && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`${(() => {
                        const [w, h] = selectedRatio.split(':').map(Number);
                        return h > w ? 'w-80 h-full' : 'w-full max-w-2xl';
                      })()} bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col gap-4`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">이미지 수정 (Image Edit)</h3>
                          <p className="text-[10px] text-white/20">수정할 내용을 아래에 입력하세요</p>
                        </div>
                        <button onClick={() => setShowEditPanel(false)} className="text-white/20 hover:text-white transition-colors">
                          <Maximize2 className="w-4 h-4 rotate-45" />
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col gap-4">
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          placeholder="이미지를 어떻게 수정할까요? (예: 배경을 바다로 바꿔줘)"
                          className="flex-1 min-h-[120px] bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-white/30 outline-none transition-all resize-none"
                        />
                        
                        <button
                          onClick={() => handleEditSubmit('modify')}
                          disabled={isEditing || !editPrompt.trim()}
                          className={`
                            w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2
                            ${isEditing || !editPrompt.trim() 
                              ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                              : 'bg-white text-black hover:bg-white/90 shadow-lg'}
                          `}
                        >
                          {isEditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          수정 적용
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center space-y-4"
                >
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <ImageIcon className="text-white/10 w-10 h-10" />
                  </div>
                  <p className="text-white/40 text-lg">Your transformed image will appear here</p>
                  <p className="text-white/20 text-sm max-w-xs mx-auto">
                    Upload an image and select an aspect ratio to begin the transformation.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Popup Modal */}
      <AnimatePresence>
        {popupImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPopupImage(null)}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-12 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-full max-h-full"
            >
              <img 
                src={popupImage} 
                alt="Full size" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -top-12 right-0 flex items-center gap-6">
                <a 
                  href={popupImage} 
                  download="image-full.png"
                  onClick={(e) => e.stopPropagation()}
                  className="text-white/60 hover:text-white flex items-center gap-2 text-sm transition-colors"
                >
                  <Upload className="w-4 h-4 rotate-180" />
                  Download
                </a>
                <button 
                  className="text-white/60 hover:text-white flex items-center gap-2 text-sm transition-colors"
                  onClick={() => setPopupImage(null)}
                >
                  Close View
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ImagePickerPopup
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSelectFromGallery}
      />

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-8 border-t border-white/10 mt-12 flex flex-col md:flex-row justify-between items-center gap-4 text-white/30 text-xs">
        <p>© 2026 Aspect Transformer • Powered by Gemini 3.1 Flash Image Preview</p>
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> High Quality 1K</span>
          <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> {ALL_ASPECT_RATIOS.length} Aspect Ratios</span>
          <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> AI Powered</span>
        </div>
      </footer>
    </div>
  );
}

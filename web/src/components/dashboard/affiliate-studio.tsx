import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Copy,
  Check,
  Download,
  RefreshCw,
  Upload,
  Sparkles,
  Shirt,
  Smartphone,
  UtensilsCrossed,
  Home,
  Baby,
  Activity,
  Wrench,
  Video,
  Plus,
  UserX,
  Bookmark,
  BookmarkCheck,
  X,
  Trash2,
  Film,
  Layers,
  MessageSquareText,
} from 'lucide-react';
import { api, type Job } from '@/lib/api';

export function cleanProductName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName.replace(/\s+/g, ' ').trim();
}

export interface AffiliateNiche {
  id: string;
  name: string;
  shortName: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NICHE_LIST: AffiliateNiche[] = [
  { id: 'auto', name: 'Deteksi otomatis', shortName: 'Otomatis', desc: 'Kategori dan demo dibaca dari data produk', icon: Layers },
  { id: 'beauty', name: 'Beauty & Skincare', shortName: 'Skincare', desc: 'Serum, sunscreen, cushion, retinol', icon: Sparkles },
  { id: 'fashion', name: 'Fashion & Apparel', shortName: 'Fashion', desc: 'Gamis, hijab, streetwear, sneakers', icon: Shirt },
  { id: 'gadget', name: 'Electronics & Tech', shortName: 'Gadget', desc: 'TWS, powerbank, smartwatch, casing', icon: Smartphone },
  { id: 'food', name: 'F&B & Viral Snacks', shortName: 'F&B', desc: 'Baso goreng, coffee blend, chips, chili oil', icon: UtensilsCrossed },
  { id: 'home', name: 'Home & Living', shortName: 'Home', desc: 'Mini blender, aesthetic storage, vacuum', icon: Home },
  { id: 'baby', name: 'Mom & Baby Care', shortName: 'Baby', desc: 'Diapers, sterilizer, baby wear, skin care', icon: Baby },
  { id: 'health', name: 'Health & Wellness', shortName: 'Health', desc: 'Collagen, vitamins, meal shakes, fitness', icon: Activity },
  { id: 'automotive', name: 'Automotive & Tools', shortName: 'Auto', desc: 'Car scratch remover, helmet wash, toolkits', icon: Wrench },
];

export interface HookArchetype {
  id: string;
  name: string;
  tag: string;
  formula: string;
  desc: string;
}

export const HOOK_ARCHETYPES: HookArchetype[] = [
  {
    id: 'auto',
    name: 'Pilih otomatis',
    tag: 'Dinamis',
    formula: '9router memilih hook paling relevan dari bukti produk.',
    desc: 'Tidak memaksakan formula yang belum tentu cocok dengan produk.',
  },
  {
    id: 'regret',
    name: 'Relatable Regret',
    tag: 'Viral Retention',
    formula: 'Sumpah nyesel banget baru tahu produk ini sekarang...',
    desc: 'Menimbulkan rasa penasaran spontan dari pengalaman pribadi yang jujur.',
  },
  {
    id: 'skeptical',
    name: 'Mythbuster & Test',
    tag: 'High Trust',
    formula: 'Beneran sebagus itu apa cuma overhype? Mari kita buktikan...',
    desc: 'Menjawab keraguan calon pembeli dengan pembuktian langsung di kamera.',
  },
  {
    id: 'problem_agitate',
    name: 'Problem & Agitate',
    tag: 'Direct Pain',
    formula: 'Capek punya masalah [X] yang gak kunjung kelar? Solusinya ini...',
    desc: 'Menyentuh titik keresahan utama sebelum memperlihatkan cara kerja produk.',
  },
  {
    id: 'secret_hack',
    name: 'Secret Discovery',
    tag: 'Curiosity',
    formula: 'Rahasia yang jarang di-spill orang tentang cara mudah mengatasi [X]...',
    desc: 'Memberikan kesan penemuan eksklusif yang memberi nilai tambah bagi penonton.',
  },
  {
    id: 'flash_deal',
    name: 'Price & Promo Drop',
    tag: 'Impulse Buy',
    formula: 'Stop scroll! Lagi ada promo potongan harga gila-gilaan khusus hari ini...',
    desc: 'Menciptakan urgensi instan untuk langsung klik keranjang belanja.',
  },
  {
    id: 'transformation',
    name: 'Before vs After',
    tag: 'Visual Proof',
    formula: 'Dari yang tadinya [kusam/rusak] jadi kayak gini cuma modal produk ini...',
    desc: 'Menampilkan kontras transformasi drastis yang sulit dilewatkan.',
  },
];

export interface VisualStyle {
  id: string;
  title: string;
  camera: string;
  desc: string;
}

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'auto',
    title: 'Creative direction otomatis',
    camera: 'Dipilih berdasarkan produk',
    desc: '9router menentukan bahasa visual, kamera, dan setting yang paling sesuai.',
  },
  {
    id: 'ugc_handheld',
    title: 'UGC Creator Handheld',
    camera: 'Eye-level smartphone camera',
    desc: 'Gaya rekaman kasual di kamar/meja dengan pencahayaan alami, sangat relatable.',
  },
  {
    id: 'macro_showcase',
    title: 'Macro Texture & Detail',
    camera: 'Close-up macro slow slider',
    desc: 'Menyorot tetesan serum, serat kain, atau detail finishing material premium.',
  },
  {
    id: 'split_problem_solution',
    title: 'Problem vs Solution',
    camera: 'Side-by-side comparison',
    desc: 'Menampilkan repotnya cara lama berbanding mudahnya menggunakan produk ini.',
  },
  {
    id: 'wear_stress_test',
    title: 'Honest Stress Test',
    camera: 'Action angle with direct proof',
    desc: 'Uji ketahanan air, gesekan, atau tes daya serap untuk kredibilitas maksimal.',
  },
];

export interface CharacterItem {
  id: string;
  name: string;
  avatar: string; // Photo 1: Face close-up
  bodyReference?: string; // Photo 2: Body / outfit
  role: string;
  demographics: string;
  flowPrompt: string;
  isCustom?: boolean;
}

const DEFAULT_CHARACTERS: CharacterItem[] = [
  {
    id: 'none',
    name: 'Tanpa Karakter (Hanya Produk)',
    avatar: '',
    role: 'Macro & Object Focus',
    demographics: 'No face on camera',
    flowPrompt: 'No human characters visible. Focus entirely on product close-up, tabletop setting, macro texture slider, and hands-only demonstration.',
  },
  {
    id: 'auto_creator',
    name: 'Kreator dinamis',
    avatar: '',
    role: 'Ditentukan dari produk dan audiens',
    demographics: 'Identitas natural yang relevan dengan produk',
    flowPrompt: 'Derive a suitable Indonesian creator, wardrobe, and setting only from the product category, target audience, and supplied evidence. Lock the chosen identity for all clips.',
  },
];

export interface VoiceStyleItem {
  id: string;
  name: string;
  tone: string;
  cadence: string;
  flowPrompt: string;
  isCustom?: boolean;
}

export const DEFAULT_VOICE_STYLES: VoiceStyleItem[] = [
  {
    id: 'auto_voice',
    name: 'Suara dinamis',
    tone: 'Ditentukan dari produk, audiens, dan creative direction',
    cadence: 'Adaptif',
    flowPrompt: 'Choose a natural Indonesian voice identity, tone, and cadence that fits the product, audience, platform, and selected creative direction. Keep it identical across every shot.',
  },
  {
    id: 'ugc_casual',
    name: 'Indonesian UGC Santai',
    tone: 'Teman curhat, santai, natural & ramah',
    cadence: '1.0x (Alami)',
    flowPrompt: 'Clear Indonesian female voice, warm, casual spoken tone like talking to a friend, natural breathing pauses, authentic UGC cadence',
  },
  {
    id: 'tech_reviewer',
    name: 'Indonesian Tech Reviewer',
    tone: 'Enerjik, lugas, artikulasi tajam',
    cadence: '1.15x (Punchy)',
    flowPrompt: 'Confident Indonesian male voice, fast-paced tech reviewer cadence, enthusiastic, crisp pronunciation, punchy delivery',
  },
  {
    id: 'soft_spoken',
    name: 'Indonesian lembut',
    tone: 'Lembut, tenang, artikulasi natural',
    cadence: '0.9x (Calm)',
    flowPrompt: 'Soft natural Indonesian voice, calm delivery, clear articulation, gentle close-mic proximity, relaxed cadence',
  },
  {
    id: 'hype_sale',
    name: 'Indonesian Livestream Host',
    tone: 'Urgensi tinggi, memacu checkout promo',
    cadence: '1.25x (Fast Hype)',
    flowPrompt: 'High-energy Indonesian livestream host voice, rapid excitement, urgent pitch, compelling callouts, vibrant inflections',
  },
];

export interface CTAItem {
  id: string;
  label: string;
  platform: string;
  actionGesture: string;
  scriptCue: string;
  isCustom?: boolean;
}

export const DEFAULT_CTA_ITEMS: CTAItem[] = [
  {
    id: 'auto_cta',
    label: 'CTA otomatis',
    platform: 'Ikuti sumber produk',
    actionGesture: 'Choose a platform-appropriate closing action from verified source data; do not invent a cart color or screen position.',
    scriptCue: 'Write a direct closing invitation that matches the verified platform without fabricated promotion or scarcity.',
  },
  {
    id: 'tiktok_cart',
    label: 'Keranjang Kuning',
    platform: 'TikTok Shop',
    actionGesture: 'Talent menunjuk ke sudut kiri bawah layar dengan ekspresi meyakinkan',
    scriptCue: 'Kalau produknya cocok buat kamu, cek detailnya di keranjang kuning kiri bawah ya.',
  },
  {
    id: 'shopee_cart',
    label: 'Keranjang Oranye',
    platform: 'Shopee Video',
    actionGesture: 'Mengarahkan jari ke ikon tas belanja oranye di layar',
    scriptCue: 'Klik keranjang oranye untuk lihat detail produk dan pilihan pembeliannya.',
  },
  {
    id: 'bio_link',
    label: 'Link di Bio',
    platform: 'Instagram / Reels',
    actionGesture: 'Menunjuk ke arah bio profil di atas',
    scriptCue: 'Cek link di bio untuk lihat detail produknya ya.',
  },
  {
    id: 'comment_mau',
    label: 'Ketik "MAU" di Komen',
    platform: 'Automated DM',
    actionGesture: 'Gesture tangan mengetik di smartphone',
    scriptCue: 'Ketik "MAU" di kolom komentar kalau kamu ingin info produknya.',
  },
];

export interface CampaignPreset {
  id: string;
  name: string;
  desc: string;
  niche: string;
  hook: string;
  style: string;
  duration: number;
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
  characterId: string;
  useVoiceover: boolean;
  voiceId: string;
  useCta: boolean;
  ctaId: string;
  isCustom?: boolean;
}

const DEFAULT_PRESETS: CampaignPreset[] = [
  {
    id: 'preset_auto_ugc',
    name: 'Affiliate otomatis',
    desc: 'Kategori, demonstrasi, dan latar diturunkan dari data produk',
    niche: 'auto',
    hook: 'auto',
    style: 'auto',
    duration: 18,
    aspectRatio: '9:16',
    characterId: 'auto_creator',
    useVoiceover: true,
    voiceId: 'auto_voice',
    useCta: true,
    ctaId: 'auto_cta',
  },
];

async function waitForCompletedJob(jobId: string, timeoutMs = 240000): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const job = await api.getJob(jobId);
    if (!job) continue;
    if (job.state === 'completed') return job;
    if (job.state === 'failed' || job.state === 'cancelled') {
      throw new Error(job.error?.message || 'Job Google Flow gagal');
    }
  }
  throw new Error('Pembuatan frame referensi melewati batas waktu');
}

export const AffiliateStudio: React.FC = () => {
  // Preset System (Modal Dialog Driven)
  const [presets, setPresets] = useState<CampaignPreset[]>(() => {
    try {
      const saved = localStorage.getItem('flow_affiliate_presets');
      if (saved) {
        const custom = (JSON.parse(saved) as CampaignPreset[])
          .filter((preset) => preset?.isCustom)
          .filter((preset) => [10, 14, 18, 20, 24, 26, 30].includes(preset.duration));
        return [...DEFAULT_PRESETS, ...custom];
      }
    } catch {}
    return DEFAULT_PRESETS;
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [newPresetDesc, setNewPresetDesc] = useState<string>('');

  // Product Ingestion & Image Uploads
  const [ingestionType, setIngestionType] = useState<'scrape' | 'manual'>('scrape');
  const [productUrl, setProductUrl] = useState<string>('');
  const [isScraping, setIsScraping] = useState<boolean>(false);

  // Scraped Media & Review Photos
  const [scrapedResult, setScrapedResult] = useState<{
    platform: 'shopee' | 'tiktok' | 'general';
    title: string;
    description: string;
    price: string;
    rating: string;
    soldCount: string;
    images: string[];
    reviewImages: string[];
    shopName?: string;
    sourceUrl?: string;
    videoUrl?: string;
  } | null>(null);
  const [activeScrapeMediaTab, setActiveScrapeMediaTab] = useState<'product' | 'reviews'>('product');

  // Real Product Details (Clean - Only Name, Images, and Description)
  const [productName, setProductName] = useState<string>('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productRating, setProductRating] = useState<string>('');
  const [productSoldCount, setProductSoldCount] = useState<string>('');
  const [productDescription, setProductDescription] = useState<string>('');
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const productFileInputRef = useRef<HTMLInputElement>(null);

  // Niche & Formula State
  const [selectedNiche, setSelectedNiche] = useState<string>('auto');
  const [selectedHook, setSelectedHook] = useState<string>('auto');
  const [selectedStyle, setSelectedStyle] = useState<string>('auto');
  const [selectedDuration, setSelectedDuration] = useState<number>(18);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');

  // Character Feature (1 or 2 Uploaded Photos)
  const [characterList, setCharacterList] = useState<CharacterItem[]>(() => {
    try {
      const saved = localStorage.getItem('flow_affiliate_characters');
      if (saved) {
        const custom = (JSON.parse(saved) as CharacterItem[]).filter((character) => character?.isCustom);
        return [...DEFAULT_CHARACTERS, ...custom];
      }
    } catch {}
    return DEFAULT_CHARACTERS;
  });
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('auto_creator');
  const [isCharModalOpen, setIsCharModalOpen] = useState<boolean>(false);

  // New Character Form
  const [newCharName, setNewCharName] = useState<string>('');
  const [newCharRole, setNewCharRole] = useState<string>('');
  const [newCharDemographics, setNewCharDemographics] = useState<string>('');
  const [newCharAvatar, setNewCharAvatar] = useState<string>(''); // Image 1 (Face)
  const [newCharBodyRef, setNewCharBodyRef] = useState<string>(''); // Image 2 (Body/Outfit)
  const [newCharPrompt, setNewCharPrompt] = useState<string>('');

  const charFaceInputRef = useRef<HTMLInputElement>(null);
  const charBodyInputRef = useRef<HTMLInputElement>(null);

  const [useVoiceover, setUseVoiceover] = useState<boolean>(true);
  const [voiceList, setVoiceList] = useState<VoiceStyleItem[]>(DEFAULT_VOICE_STYLES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('auto_voice');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);

  // New Voice Style Form
  const [newVoiceName, setNewVoiceName] = useState<string>('');
  const [newVoiceTone, setNewVoiceTone] = useState<string>('');
  const [newVoiceCadence, setNewVoiceCadence] = useState<string>('1.0x (Alami)');
  const [newVoicePrompt, setNewVoicePrompt] = useState<string>('');

  const [useCta, setUseCta] = useState<boolean>(true);
  const [ctaList, setCtaList] = useState<CTAItem[]>(DEFAULT_CTA_ITEMS);
  const [selectedCtaId, setSelectedCtaId] = useState<string>('auto_cta');
  const [isCtaModalOpen, setIsCtaModalOpen] = useState<boolean>(false);

  // New CTA Form
  const [newCtaLabel, setNewCtaLabel] = useState<string>('');
  const [newCtaPlatform, setNewCtaPlatform] = useState<string>('TikTok Shop');
  const [newCtaGesture, setNewCtaGesture] = useState<string>('');
  const [newCtaScriptCue, setNewCtaScriptCue] = useState<string>('');

  // Generation Pipeline State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [reviewDraft, setReviewDraft] = useState<{
    request: any;
    storyboard: any;
    framePrompts: string[];
    frameUrls: string[];
    planningProvider: '9router';
    planningModel: string;
    timeline: { duration: number; segmentDurations: number[]; shotCount: number };
  } | null>(null);
  const [generatedOutput, setGeneratedOutput] = useState<{
    jobId: string;
    videoUrl: string;
    duration: number;
    aspectRatio: string;
    title: string;
    caption: string;
    hashtags: string[];
    scriptBreakdown: { time: string; shot: string; dialogue: string; direction: string }[];
    clipFrames: {
      clipNumber: number;
      timecode: string;
      title: string;
      visualCue: string;
      cameraPrompt: string;
      audioLine: string;
      thumbnailUrl?: string;
      isNanoBananaFrame?: boolean;
    }[];
    hookAlternatives: string[];
    characterUsed: string;
    voiceUsed: string;
    ctaUsed: string;
  } | null>(null);

  const [activeOutputTab, setActiveOutputTab] = useState<'frames' | 'script' | 'caption' | 'hooks'>('frames');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [generatingFrameClipNumber, setGeneratingFrameClipNumber] = useState<number | null>(null);

  // Background Job Execution & Streaming State
  const [jobState, setJobState] = useState<'queued' | 'running' | 'completed' | 'failed' | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobCompletedSegments, setJobCompletedSegments] = useState<number>(0);
  const [jobStatusMessage, setJobStatusMessage] = useState<string>('');

  useEffect(() => {
    if (!generatedOutput?.jobId || jobState === 'completed' || jobState === 'failed') return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const job = await api.getJob(generatedOutput.jobId);
        if (!isMounted || !job) return;

        setJobState(job.state as any);
        if (job.progress !== undefined) setJobProgress(job.progress);

        if (job.checkpoint?.completedSegments !== undefined) {
          const segCount = job.checkpoint.completedSegments;
          setJobCompletedSegments(segCount);
          const totalSegments = generatedOutput.clipFrames.length;
          if (segCount < totalSegments) {
            setCurrentStep(4);
            setJobStatusMessage(`Merender klip ${Math.min(segCount + 1, totalSegments)}/${totalSegments} dengan continuity chaining...`);
          } else {
            setCurrentStep(5);
            setJobStatusMessage(`Menggabungkan ${totalSegments} klip dengan sambungan langsung...`);
          }
        } else if (job.state === 'running') {
          setCurrentStep(4);
          setJobStatusMessage(`Memproses continuous video chaining (${job.progress || 20}%)...`);
        }

        if (job.state === 'completed') {
          setJobCompletedSegments(generatedOutput.clipFrames.length);
          setJobProgress(100);
          setCurrentStep(5);
          setIsGenerating(false);
          setJobStatusMessage('Master video siap ditonton & diunduh!');
        } else if (job.state === 'failed') {
          setIsGenerating(false);
          setJobStatusMessage(`Gagal: ${job.error?.message || 'Gagal memproses render video'}`);
        }
      } catch (err) {
        console.warn('[AffiliateStudio] Job poll note:', err);
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [generatedOutput?.jobId, generatedOutput?.clipFrames.length, jobState]);

  useEffect(() => {
    try {
      localStorage.setItem('flow_affiliate_presets', JSON.stringify(presets));
    } catch {}
  }, [presets]);

  useEffect(() => {
    try {
      localStorage.setItem('flow_affiliate_characters', JSON.stringify(characterList));
    } catch {}
  }, [characterList]);

  const handleApplyPreset = (p: CampaignPreset) => {
    setActivePresetId(p.id);
    setSelectedNiche(p.niche);
    setSelectedHook(p.hook);
    setSelectedStyle(p.style);
    setSelectedDuration(p.duration);
    setAspectRatio(p.aspectRatio);
    setSelectedCharacterId(p.characterId);
    setSelectedVoiceId(p.voiceId);
    setUseVoiceover(p.useVoiceover);
    setSelectedCtaId(p.ctaId);
    setUseCta(p.useCta);
  };

  const handleSaveCurrentPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: CampaignPreset = {
      id: `preset_custom_${Date.now()}`,
      name: newPresetName.trim(),
      desc: newPresetDesc.trim() || 'Preset konfigurasi kustom',
      niche: selectedNiche,
      hook: selectedHook,
      style: selectedStyle,
      duration: selectedDuration,
      aspectRatio,
      characterId: selectedCharacterId,
      useVoiceover,
      voiceId: selectedVoiceId,
      useCta,
      ctaId: selectedCtaId,
      isCustom: true,
    };
    setPresets((prev) => [...prev, newPreset]);
    setActivePresetId(newPreset.id);
    setNewPresetName('');
    setNewPresetDesc('');
    setIsSavePresetModalOpen(false);
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePresetId === id) setActivePresetId(null);
  };

  const handleProductFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setProductImages((prev) => [...prev, e.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCharFaceFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setNewCharAvatar(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCharBodyFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setNewCharBodyRef(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleScrapeProductUrl = async () => {
    if (!productUrl.trim()) return;
    setIsScraping(true);
    setScrapeError(null);

    try {
      const data = await api.scrapeProduct(productUrl.trim());
      setScrapedResult(data);
      if (data.title) setProductName(cleanProductName(data.title));
      if (data.description) setProductDescription(data.description);
      if (data.rating) setProductRating(data.rating);
      if (data.soldCount) setProductSoldCount(data.soldCount);

      // Only set images if real images were returned
      if (data.images && data.images.length > 0) {
        setProductImages(data.images.slice(0, 4));
      }
    } catch (err: any) {
      setScrapedResult(null);
      setScrapeError(
        err.message || 'Gagal mengambil data dari URL ini. Pastikan link produk aktif atau masukkan foto & deskripsi secara manual.'
      );
    } finally {
      setIsScraping(false);
    }
  };

  const handleToggleScrapedImage = (imgUrl: string) => {
    setProductImages((prev) => {
      if (prev.includes(imgUrl)) {
        return prev.filter((u) => u !== imgUrl);
      }
      if (prev.length >= 6) return prev;
      return [...prev, imgUrl];
    });
  };

  const handleAddAllReviewImages = () => {
    if (!scrapedResult?.reviewImages) return;
    setProductImages((prev) => {
      const merged = [...prev];
      for (const rImg of scrapedResult.reviewImages) {
        if (!merged.includes(rImg) && merged.length < 6) {
          merged.push(rImg);
        }
      }
      return merged;
    });
  };

  const handleAddCharacter = () => {
    if (!newCharName.trim() || !newCharAvatar) return;
    const newChar: CharacterItem = {
      id: `custom_char_${Date.now()}`,
      name: newCharName.trim(),
      role: newCharRole.trim() || 'Ditentukan dari produk dan arahan pengguna',
      demographics: newCharDemographics.trim() || 'Ikuti foto referensi tanpa asumsi tambahan',
      avatar: newCharAvatar,
      bodyReference: newCharBodyRef || undefined,
      flowPrompt:
        newCharPrompt.trim() ||
        `Preserve the creator identity named ${newCharName} from the supplied reference images. Derive wardrobe, behavior, and setting from the product brief.`,
      isCustom: true,
    };
    setCharacterList((prev) => [...prev, newChar]);
    setSelectedCharacterId(newChar.id);
    setNewCharName('');
    setNewCharRole('');
    setNewCharDemographics('');
    setNewCharAvatar('');
    setNewCharBodyRef('');
    setNewCharPrompt('');
    setIsCharModalOpen(false);
  };

  const handleAddVoiceStyle = () => {
    if (!newVoiceName.trim()) return;
    const newVoice: VoiceStyleItem = {
      id: `custom_voice_${Date.now()}`,
      name: newVoiceName.trim(),
      tone: newVoiceTone.trim() || 'Natural tone',
      cadence: newVoiceCadence || '1.0x (Alami)',
      flowPrompt: newVoicePrompt.trim() || `Indonesian speech with ${newVoiceTone} tone, clear delivery`,
      isCustom: true,
    };
    setVoiceList((prev) => [...prev, newVoice]);
    setSelectedVoiceId(newVoice.id);
    setNewVoiceName('');
    setNewVoiceTone('');
    setNewVoicePrompt('');
    setIsVoiceModalOpen(false);
  };

  const handleAddCta = () => {
    if (!newCtaLabel.trim()) return;
    const newCta: CTAItem = {
      id: `custom_cta_${Date.now()}`,
      label: newCtaLabel.trim(),
      platform: newCtaPlatform,
      actionGesture: newCtaGesture.trim() || 'Talent mengarahkan audiens ke aksi call-to-action',
      scriptCue: newCtaScriptCue.trim() || 'Arahkan audiens untuk melihat detail produk tanpa klaim promo atau urgensi yang tidak terverifikasi.',
      isCustom: true,
    };
    setCtaList((prev) => [...prev, newCta]);
    setSelectedCtaId(newCta.id);
    setNewCtaLabel('');
    setNewCtaGesture('');
    setNewCtaScriptCue('');
    setIsCtaModalOpen(false);
  };

  const buildGenerationRequest = () => {
    const activeChar = characterList.find((c) => c.id === selectedCharacterId) || characterList[0];
    const activeVoice = voiceList.find((v) => v.id === selectedVoiceId) || voiceList[0];
    const activeCta = ctaList.find((c) => c.id === selectedCtaId) || ctaList[0];
    return {
      productName: cleanProductName(productName),
      description: productDescription.trim(),
      productImages,
      niche: selectedNiche,
      hook: selectedHook,
      style: selectedStyle,
      duration: selectedDuration as 10 | 14 | 18 | 20 | 24 | 26 | 30,
      aspectRatio,
      commerceFacts: {
        platform: scrapedResult?.platform,
        price: scrapedResult?.price || undefined,
        rating: productRating || undefined,
        soldCount: productSoldCount || undefined,
        shopName: scrapedResult?.shopName,
        sourceUrl: scrapedResult?.sourceUrl,
      },
      character: {
        id: selectedCharacterId,
        name: activeChar.name,
        role: activeChar.role,
        demographics: activeChar.demographics,
        avatar: activeChar.avatar,
        bodyReference: activeChar.bodyReference,
        flowPrompt: activeChar.flowPrompt,
        isNone: selectedCharacterId === 'none',
      },
      voiceover: {
        enabled: useVoiceover,
        id: selectedVoiceId,
        name: activeVoice.name,
        tone: activeVoice.tone,
        cadence: activeVoice.cadence,
        flowPrompt: activeVoice.flowPrompt,
      },
      cta: {
        enabled: useCta,
        id: selectedCtaId,
        label: activeCta.label,
        platform: activeCta.platform,
        actionGesture: activeCta.actionGesture,
        scriptCue: activeCta.scriptCue,
      },
    };
  };

  const generateReferenceFrames = async (framePrompts: string[], existingFrames: string[] = []) => {
    const frames: string[] = [];
    for (let index = 0; index < framePrompts.length; index += 1) {
      const references = [
        ...productImages,
        characterList.find((c) => c.id === selectedCharacterId)?.avatar,
        characterList.find((c) => c.id === selectedCharacterId)?.bodyReference,
        frames[index - 1],
        existingFrames[index - 1],
      ].filter(Boolean) as string[];
      const frameJob = await api.createImage({
        prompt: framePrompts[index],
        model: 'nano-banana-2',
        aspectRatio,
        count: 1,
        references,
      });
      const completed = await waitForCompletedJob(frameJob.id);
      const imageUrl = completed.result?.url || completed.result?.media?.[0];
      if (!imageUrl) throw new Error(`Frame referensi shot ${index + 1} tidak tersedia`);
      frames.push(imageUrl);
      setGenerationLogs((previous) => [...previous, `Frame ${index + 1}/${framePrompts.length} siap.`]);
    }
    return frames;
  };

  const handleStartGeneration = async (variationNote?: string) => {
    if (!productName.trim() || isGenerating) return;
    const request = { ...buildGenerationRequest(), variationNote };
    setIsGenerating(true);
    setCurrentStep(1);
    setReviewDraft(null);
    setGeneratedOutput(null);
    setJobState(null);
    setGenerationLogs([
      `Menyusun creative direction ${request.duration} detik dari data produk...`,
      '9router memilih style, struktur shot, demo, audio, dan continuity secara dinamis.',
    ]);

    try {
      setCurrentStep(2);
      const plan = await api.planAffiliateVideo(request, (progressMsg) => {
        setGenerationLogs((previous) => {
          if (previous.length > 0 && previous[previous.length - 1] === progressMsg) return previous;
          if (previous.length > 0 && previous[previous.length - 1].includes('tokens)')) {
            return [...previous.slice(0, -1), progressMsg];
          }
          return [...previous, progressMsg];
        });
      });
      setGenerationLogs((previous) => [
        ...previous,
        `Storyboard siap dari ${plan.planningProvider} (${plan.planningModel}).`,
        `Membuat ${plan.framePrompts.length} frame referensi untuk tahap review...`,
      ]);
      setCurrentStep(3);
      const frameUrls = await generateReferenceFrames(plan.framePrompts);
      setReviewDraft({
        request,
        storyboard: plan.storyboard,
        framePrompts: plan.framePrompts,
        frameUrls,
        planningProvider: plan.planningProvider,
        planningModel: plan.planningModel,
        timeline: plan.timeline,
      });
      setCurrentStep(0);
      setGenerationLogs((previous) => [...previous, 'Draft siap direview. Flow belum dijalankan.']);
    } catch (err: any) {
      setGenerationLogs((previous) => [...previous, `[ERROR] ${err.message || 'Gagal membuat draft'}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateReferenceFrame = async (index: number) => {
    if (!reviewDraft || generatingFrameClipNumber !== null) return;
    setGeneratingFrameClipNumber(index + 1);
    try {
      const previousFrame = reviewDraft.frameUrls[index - 1];
      const references = [
        ...productImages,
        characterList.find((c) => c.id === selectedCharacterId)?.avatar,
        characterList.find((c) => c.id === selectedCharacterId)?.bodyReference,
        previousFrame,
      ].filter(Boolean) as string[];
      const frameJob = await api.createImage({
        prompt: `${reviewDraft.framePrompts[index]} Create a fresh variation while keeping every locked continuity detail unchanged.`,
        model: 'nano-banana-2',
        aspectRatio,
        count: 1,
        references,
      });
      const completed = await waitForCompletedJob(frameJob.id);
      const imageUrl = completed.result?.url || completed.result?.media?.[0];
      if (!imageUrl) throw new Error('Image generator tidak mengembalikan frame');
      setReviewDraft((current) => current ? {
        ...current,
        frameUrls: current.frameUrls.map((url, frameIndex) => frameIndex === index ? imageUrl : url),
      } : null);
    } catch (err: any) {
      setGenerationLogs((previous) => [...previous, `[ERROR] ${err.message}`]);
    } finally {
      setGeneratingFrameClipNumber(null);
    }
  };

  const handleApproveAndGenerate = async () => {
    if (!reviewDraft || isGenerating) return;
    const activeChar = characterList.find((c) => c.id === selectedCharacterId) || characterList[0];
    const activeVoice = voiceList.find((v) => v.id === selectedVoiceId) || voiceList[0];
    const activeCta = ctaList.find((c) => c.id === selectedCtaId) || ctaList[0];
    setIsGenerating(true);
    setCurrentStep(4);
    setGenerationLogs((previous) => [...previous, 'Draft disetujui. Mengirim shot ke Flow dengan last-frame chaining...']);
    try {
      const result = await api.createAffiliateVideo({
        ...reviewDraft.request,
        startFrame: reviewDraft.frameUrls[0],
        referenceFrames: reviewDraft.frameUrls,
        storyboard: reviewDraft.storyboard,
        planningProvider: reviewDraft.planningProvider,
        planningModel: reviewDraft.planningModel,
      });
      setJobState('queued');
      setJobProgress(10);
      setJobCompletedSegments(0);
      setJobStatusMessage('Job Flow terdaftar. Menjalankan continuous chaining...');
      setGeneratedOutput({
        jobId: result.jobId,
        videoUrl: result.videoUrl,
        duration: result.targetDuration,
        aspectRatio: result.aspectRatio,
        title: reviewDraft.storyboard.title,
        caption: result.copywriting?.caption || '',
        hashtags: result.copywriting?.hashtags || [],
        scriptBreakdown: result.clipFrames.map((shot) => ({
          time: shot.timeCode,
          shot: shot.title,
          dialogue: shot.scriptCue || '(Tanpa dialog)',
          direction: shot.visualCue || shot.prompt,
        })),
        clipFrames: result.clipFrames.map((shot, index) => ({
          clipNumber: shot.clipNumber,
          timecode: shot.timeCode,
          title: shot.title,
          visualCue: shot.visualCue,
          cameraPrompt: shot.prompt,
          audioLine: shot.scriptCue,
          thumbnailUrl: reviewDraft.frameUrls[index],
          isNanoBananaFrame: true,
        })),
        hookAlternatives: result.hookAlternatives || [],
        characterUsed: selectedCharacterId === 'none' ? 'Object only' : activeChar.name,
        voiceUsed: useVoiceover ? `${activeVoice.name} (${activeVoice.cadence})` : 'Tanpa voiceover',
        ctaUsed: useCta ? `${activeCta.label} (${activeCta.platform})` : 'Tanpa CTA',
      });
      setReviewDraft(null);
    } catch (err: any) {
      setIsGenerating(false);
      setGenerationLogs((previous) => [...previous, `[ERROR] ${err.message || 'Flow gagal dimulai'}`]);
    }
  };
  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header with Clean Template Preset Trigger */}
      <div className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Affiliate studio
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Susun arah kreatif, review frame tiap shot, lalu kirim konsep yang disetujui ke Google Flow.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activePresetId ? (
            <div className="inline-flex items-center rounded-md border border-border bg-surface-subtle h-8 px-2.5 gap-2 text-xs">
              <Bookmark className="size-3.5 text-foreground" />
              <span className="text-muted-foreground">Preset:</span>
              <span className="font-semibold text-foreground">{presets.find((p) => p.id === activePresetId)?.name || 'Kustom'}</span>
              <button
                type="button"
                onClick={() => setActivePresetId(null)}
                title="Lepas preset (kembali ke settingan manual)"
                className="size-4 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/20 h-8 px-2.5 gap-1.5 text-xs text-muted-foreground">
              <Bookmark className="size-3.5 text-muted-foreground/60" />
              <span>Preset: Belum ada</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPresetModalOpen(true)}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <span>{activePresetId ? 'Ganti preset' : 'Pilih preset'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSavePresetModalOpen(true)}
            className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <BookmarkCheck className="size-3.5" />
            <span>Simpan settingan</span>
          </Button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Section 1: Product Ingestion & Image Uploads */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">1. Ingest produk & upload gambar</span>
              <div className="inline-flex h-7 items-center rounded-md bg-muted/50 p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setIngestionType('scrape')}
                  className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition-colors cursor-pointer ${
                    ingestionType === 'scrape'
                      ? 'bg-background text-foreground border border-border shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Scrape Shopee / TikTok Shop
                </button>
                <button
                  type="button"
                  onClick={() => setIngestionType('manual')}
                  className={`px-2.5 py-0.5 rounded-xs text-[11px] font-medium transition-colors cursor-pointer ${
                    ingestionType === 'manual'
                      ? 'bg-background text-foreground border border-border shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Upload manual
                </button>
              </div>
            </div>

            {ingestionType === 'scrape' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    placeholder="Paste link produk Shopee (shopee.co.id / shp.ee) atau TikTok Shop (shop.tiktok.com / vt.tiktok.com)..."
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    className="pr-28 font-sans text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={handleScrapeProductUrl}
                    disabled={isScraping || !productUrl.trim()}
                    className="absolute right-1 top-1 h-7 px-3 text-xs gap-1 cursor-pointer"
                  >
                    {isScraping ? (
                      <>
                        <RefreshCw className="size-3 animate-spin" />
                        <span>Scraping...</span>
                      </>
                    ) : (
                      <span>Scrape produk</span>
                    )}
                  </Button>
                </div>

                {/* Scrape Error Message */}
                {scrapeError && (
                  <div className="p-2.5 rounded-md border border-red-500/20 bg-red-500/10 text-red-600 text-xs flex items-start justify-between gap-2">
                    <span>{scrapeError}</span>
                    <button
                      type="button"
                      onClick={() => setScrapeError(null)}
                      className="cursor-pointer text-red-500 hover:text-red-700 shrink-0"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}

                {/* Scraped Media Gallery & Review Photos Inspector */}
                {scrapedResult && (scrapedResult.title || scrapedResult.images?.length > 0) && (
                  <div className="rounded-md border border-border bg-surface-subtle p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs border font-medium ${
                          scrapedResult.platform === 'shopee'
                            ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                            : scrapedResult.platform === 'tiktok'
                            ? 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20'
                            : 'bg-muted text-foreground border-border'
                        }`}>
                          {scrapedResult.platform === 'shopee' ? 'Shopee Terverifikasi' : scrapedResult.platform === 'tiktok' ? 'TikTok Shop Terverifikasi' : 'E-Commerce'}
                        </span>
                        {scrapedResult.shopName && (
                          <span className="text-[11px] text-foreground font-medium truncate max-w-[200px]">
                            {scrapedResult.shopName}
                          </span>
                        )}
                        {(scrapedResult.rating || scrapedResult.soldCount) && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {[scrapedResult.rating, scrapedResult.soldCount].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sub-tabs: Foto Produk vs Foto Review Pembeli (Always visible filter tabs for Shopee & TikTok) */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveScrapeMediaTab('product')}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-xs cursor-pointer transition-colors ${
                            activeScrapeMediaTab === 'product'
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Foto produk ({scrapedResult.images?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveScrapeMediaTab('reviews')}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-xs cursor-pointer transition-colors flex items-center gap-1 ${
                            activeScrapeMediaTab === 'reviews'
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <MessageSquareText className="size-3" />
                          <span>Foto review pembeli ({scrapedResult.reviewImages?.length || 0})</span>
                        </button>
                      </div>

                      {activeScrapeMediaTab === 'reviews' && scrapedResult.reviewImages && scrapedResult.reviewImages.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAddAllReviewImages}
                          className="text-[10px] text-foreground hover:underline font-medium cursor-pointer"
                        >
                          + Ambil semua foto review ({scrapedResult.reviewImages.length})
                        </button>
                      )}
                    </div>

                    {/* Thumbnail Selector Strip or Empty State */}
                    {activeScrapeMediaTab === 'reviews' && (!scrapedResult.reviewImages || scrapedResult.reviewImages.length === 0) ? (
                      <div className="text-[11px] text-muted-foreground py-2.5 px-3 bg-surface rounded-xs border border-border/60 flex items-center gap-2">
                        <MessageSquareText className="size-3.5 text-muted-foreground/70 shrink-0" />
                        <span>Belum ada foto review pembeli pada link produk ini. Anda dapat mengunggah foto review/unboxing secara manual.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {(activeScrapeMediaTab === 'product' ? scrapedResult.images : scrapedResult.reviewImages || []).map((imgUrl, i) => {
                          const isSelected = productImages.includes(imgUrl);
                          return (
                            <div
                              key={i}
                              onClick={() => handleToggleScrapedImage(imgUrl)}
                              className={`relative h-16 w-20 rounded-md border overflow-hidden shrink-0 cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-foreground ring-1 ring-foreground'
                                  : 'border-border opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img src={imgUrl} alt={`Scraped ${i + 1}`} className="w-full h-full object-cover" />
                              {isSelected && (
                                <div className="absolute top-1 right-1 size-4 rounded-full bg-foreground text-background flex items-center justify-center">
                                  <Check className="size-2.5" />
                                </div>
                              )}
                              {activeScrapeMediaTab === 'reviews' && (
                                <span className="absolute bottom-1 left-1 px-1 rounded-xs bg-black/70 text-[8px] text-white font-mono">
                                  Review
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Klik thumbnail di atas untuk menambahkan atau menghapus foto dari galeri video.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Product Image Upload Zone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-foreground">Foto produk (Bisa upload 1-4 gambar):</span>
                <span className="text-[10px] text-muted-foreground">Mendukung format JPG, PNG, WebP</span>
              </div>

              {/* Hidden file input */}
              <input
                ref={productFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleProductFiles(e.target.files)}
              />

              <div className="flex flex-wrap items-center gap-2">
                {/* Upload Trigger Button */}
                <button
                  type="button"
                  onClick={() => productFileInputRef.current?.click()}
                  className="h-20 w-24 rounded-md border border-dashed border-border bg-background hover:bg-surface-hover flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                >
                  <Upload className="size-4 mb-1" />
                  <span className="text-[10px] font-medium">+ Upload foto</span>
                </button>

                {/* Uploaded Thumbnails */}
                {productImages.map((img, idx) => (
                  <div key={idx} className="relative h-20 w-24 rounded-md border border-border overflow-hidden bg-background shrink-0 group">
                    <img src={img} alt={`Product ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setProductImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 px-1 rounded-xs bg-black/60 text-[9px] text-white font-mono">
                      #{idx + 1}
                    </span>
                  </div>
                ))}

                {productImages.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic pl-2">
                    Belum ada foto produk diunggah. Klik upload atau scrape dari Shopee.
                  </p>
                )}
              </div>
            </div>

            {/* Editable Product Fields: Nama produk & Deskripsi produk */}
            <div className="p-3 rounded-md border border-border bg-surface-subtle space-y-2.5">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">Nama produk</span>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Nama produk lengkap..."
                  className="h-7 text-xs bg-background"
                />
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block mb-0.5">Deskripsi produk</span>
                <textarea
                  rows={3}
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Paste deskripsi produk dari Shopee atau supplier di sini..."
                  className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground resize-none leading-relaxed"
                />
              </div>
            </div>

          </div>

          {/* Section 2: Character / Talent Persona (1 or 2 Uploaded Photos) */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground block">2. Karakter talent video</span>
                <span className="text-[11px] text-muted-foreground">Karakter referensi 1-2 gambar atau mode tanpa wajah</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCharModalOpen(true)}
                className="h-7 text-xs gap-1 cursor-pointer"
              >
                <Plus className="size-3" />
                <span>Tambah karakter</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {characterList.map((char) => {
                const isSelected = selectedCharacterId === char.id;
                const hasTwoImages = Boolean(char.avatar && char.bodyReference);
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => setSelectedCharacterId(char.id)}
                    className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer flex items-start gap-2.5 ${
                      isSelected
                        ? 'border-foreground bg-surface-subtle text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {char.avatar ? (
                      <div className="flex -space-x-2 shrink-0">
                        <img
                          src={char.avatar}
                          alt={char.name}
                          className="size-10 rounded-full object-cover border-2 border-background shrink-0 bg-background"
                        />
                        {char.bodyReference && (
                          <img
                            src={char.bodyReference}
                            alt="Body"
                            className="size-10 rounded-full object-cover border-2 border-background shrink-0 bg-background"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="size-10 rounded-full border border-border bg-muted/30 flex items-center justify-center shrink-0">
                        <UserX className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate">{char.name}</span>
                        <div className="flex items-center gap-1">
                          {hasTwoImages && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground shrink-0">
                              2 Foto
                            </span>
                          )}
                          {char.isCustom && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground shrink-0">
                              Kustom
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{char.role}</div>
                      <div className="text-[10px] text-muted-foreground/80 truncate">{char.demographics}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedCharacterId === 'none' && (
              <p className="text-[11px] text-muted-foreground bg-surface-subtle p-2 rounded-md border border-border">
                Mode tanpa karakter aktif: Kamera hanya menyorot produk, b-roll meja, dan tes tekstur tanpa menampilkan wajah talent.
              </p>
            )}
          </div>

          {/* Section 3: Voiceover Style */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground block">3. Audio & voiceover</span>
                <span className="text-[11px] text-muted-foreground">Opsional; bila aktif, karakter suara dan audio bed dijaga konsisten</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground font-medium">
                  {useVoiceover ? 'Voiceover aktif' : 'Tanpa voiceover'}
                </span>
                <Switch checked={useVoiceover} onCheckedChange={setUseVoiceover} aria-label="Aktifkan voiceover" />
              </div>
            </div>

            {useVoiceover && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Pilih gaya suara bicara:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="h-6 text-[11px] gap-1 px-2 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>Tambah style VO</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {voiceList.map((v) => {
                    const isSelected = selectedVoiceId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVoiceId(v.id)}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-foreground bg-surface-subtle text-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-foreground truncate">{v.name}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground shrink-0">
                            {v.cadence}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-1">{v.tone}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Call to Action */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground block">4. Call to Action (CTA)</span>
                <span className="text-[11px] text-muted-foreground">Opsional; diarahkan ke beat penutup sesuai platform</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground font-medium">
                  {useCta ? 'CTA aktif' : 'Tanpa CTA'}
                </span>
                <Switch checked={useCta} onCheckedChange={setUseCta} aria-label="Aktifkan CTA" />
              </div>
            </div>

            {useCta && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Pilih jenis CTA:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCtaModalOpen(true)}
                    className="h-6 text-[11px] gap-1 px-2 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>Tambah CTA</span>
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ctaList.map((item) => {
                    const isSelected = selectedCtaId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedCtaId(item.id)}
                        className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-foreground bg-surface-subtle text-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-foreground">{item.label}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground">
                            {item.platform}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-1">{item.scriptCue}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Target Niche & Hook Archetypes */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">5. Kategori niche & formula hook</span>
              <span className="text-[11px] text-muted-foreground">Optimasi algoritma 3 detik pertama</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NICHE_LIST.map((niche) => {
                const isSelected = selectedNiche === niche.id;
                const IconComponent = niche.icon;
                return (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => {
                      setSelectedNiche(niche.id);
                    }}
                    className={`p-2 rounded-md border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-foreground bg-surface-subtle text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <IconComponent className="size-3.5 shrink-0 text-foreground" />
                      {niche.id === 'auto' && <span className="text-[9px] font-mono text-muted-foreground">auto</span>}
                    </div>
                    <div className="text-xs font-semibold text-foreground truncate">{niche.shortName}</div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{niche.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Hook Archetype Selection */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Hook pembuka (0-3s):</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HOOK_ARCHETYPES.map((hook) => {
                  const isSelected = selectedHook === hook.id;
                  return (
                    <button
                      key={hook.id}
                      type="button"
                      onClick={() => setSelectedHook(hook.id)}
                      className={`p-2 rounded-md border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-foreground bg-surface-subtle text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate">{hook.name}</span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs border border-border bg-background text-muted-foreground shrink-0">
                          {hook.tag}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{hook.formula}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Production Visual Style Selection */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Angle visual kamera:</span>
              <div className="grid grid-cols-2 gap-2">
                {VISUAL_STYLES.map((st) => {
                  const isSelected = selectedStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`p-2 rounded-md border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-foreground bg-surface-subtle text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      <div className="text-xs font-semibold text-foreground truncate">{st.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{st.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 6: Format & Duration Specs */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <span className="text-xs font-semibold text-foreground block">6. Format rasio & durasi</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Aspect Ratio */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Aspect ratio:</span>
                <div className="grid grid-cols-4 gap-1">
                  {(['9:16', '16:9', '1:1', '4:5'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAspectRatio(r)}
                      className={`py-1.5 rounded-md text-xs font-mono border transition-colors cursor-pointer ${
                        aspectRatio === r
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Durasi video:</span>
                <div className="grid grid-cols-4 gap-1">
                  {[10, 14, 18, 20, 24, 26, 30].map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setSelectedDuration(duration)}
                      className={`h-8 rounded-md text-xs font-mono border transition-colors cursor-pointer ${selectedDuration === duration ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'}`}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Dibagi otomatis menjadi klip Omni 4, 6, 8, atau 10 detik.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Execution & Deliverables Inspector (5 Cols) */}
        <div className="lg:col-span-5 sticky top-16 space-y-4">
          
          {/* Action Trigger Card */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Pipeline render</span>
              <span className="text-[10px] font-mono text-muted-foreground">9router/Codex → frame → review → Flow</span>
            </div>

            <Button
              onClick={() => handleStartGeneration()}
              disabled={isGenerating || !productName.trim()}
              className="w-full h-9 font-medium cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                  <span>Sedang memproses pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current mr-1.5" />
                  <span>Buat draft & frame review</span>
                </>
              )}
            </Button>
            {!productName.trim() && (
              <p className="text-[11px] text-muted-foreground text-center">
                Upload foto produk & masukkan nama produk di sebelah kiri untuk memulai render.
              </p>
            )}
          </div>

          {reviewDraft && !generatedOutput && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-foreground">Review sebelum Flow</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {reviewDraft.timeline.duration}s · {reviewDraft.timeline.segmentDurations.join(' + ')}s
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground">{reviewDraft.storyboard.creativeDirection?.styleName}</p>
                <p className="text-[11px] text-muted-foreground">{reviewDraft.storyboard.creativeDirection?.rationale}</p>
              </div>

              <div className="space-y-2">
                {reviewDraft.storyboard.shots.map((shot: any, index: number) => (
                  <div key={shot.shotIndex} className="rounded-md border border-border bg-surface-subtle p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{shot.title}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{shot.timeCode}</span>
                    </div>
                    <img src={reviewDraft.frameUrls[index]} alt={`Frame review ${index + 1}`} className="w-full aspect-[9/16] max-h-64 object-cover rounded-md border border-border bg-background" />
                    <p className="text-[11px] text-foreground">{shot.visualCue}</p>
                    {shot.scriptCue && <p className="text-[10px] text-muted-foreground">“{shot.scriptCue}”</p>}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] w-full"
                      onClick={() => handleRegenerateReferenceFrame(index)}
                      disabled={generatingFrameClipNumber !== null}
                    >
                      {generatingFrameClipNumber === index + 1 ? <RefreshCw className="size-3 animate-spin mr-1.5" /> : <RefreshCw className="size-3 mr-1.5" />}
                      Regenerate frame ini
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => handleStartGeneration('Buat arah kreatif alternatif yang berbeda namun tetap berdasarkan fakta produk.')} disabled={isGenerating}>
                  Regenerate konsep
                </Button>
                <Button type="button" size="sm" onClick={handleApproveAndGenerate} disabled={isGenerating}>
                  Setujui & generate
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Flow belum dijalankan sampai tombol setujui dipilih.</p>
            </div>
          )}

          {/* Active Generation Pipeline Progress */}
          {(isGenerating || (jobState && jobState !== 'completed') || (generatedOutput && currentStep === 5)) && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  {currentStep === 5 && jobState === 'completed' ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                  )}
                  {currentStep === 5 && jobState === 'completed' ? 'Pipeline video selesai' : 'Progress pipeline & rendering'}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {currentStep === 5 && jobState === 'completed' ? '5 dari 5 tahap selesai' : `Tahap ${currentStep} dari 5`}
                </span>
              </div>

              {/* Step checklist */}
              <div className="space-y-1.5 pt-1">
                {[
                  { step: 1, label: 'Validasi fakta dan referensi produk' },
                  { step: 2, label: 'Storyboard JSON melalui 9router' },
                  { step: 3, label: 'Frame referensi tiap shot & review' },
                  { step: 4, label: 'Render klip dengan last-frame chaining' },
                  { step: 5, label: 'Kompilasi master video dan copywriting' },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2 text-xs">
                    {currentStep > s.step || (currentStep === 5 && jobState === 'completed' && s.step === 5) ? (
                      <Check className="size-3.5 text-emerald-600 shrink-0" />
                    ) : currentStep === s.step ? (
                      <RefreshCw className="size-3.5 text-foreground animate-spin shrink-0" />
                    ) : (
                      <div className="size-3.5 rounded-full border border-border shrink-0" />
                    )}
                    <span
                      className={
                        currentStep === s.step && jobState !== 'completed'
                          ? 'text-foreground font-medium'
                          : currentStep > s.step || (currentStep === 5 && jobState === 'completed')
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/60'
                      }
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Execution log terminal */}
              <div className="p-2.5 rounded-md bg-code-bg border border-border font-mono text-[10px] text-muted-foreground space-y-0.5 overflow-hidden max-h-24 overflow-y-auto">
                {generationLogs.map((log, i) => (
                  <div key={i} className="truncate">{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* Rendered Output Deliverables */}
          {generatedOutput && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span className={`size-2 rounded-full ${jobState === 'completed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                  <span>{jobState === 'completed' ? 'Hasil master video' : 'Monitor Render Google Flow'}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{generatedOutput.jobId}</span>
              </div>

              {/* Actual Video Player or In-Progress Render Screen */}
              <div className="relative rounded-md overflow-hidden bg-black aspect-[9/16] max-h-[380px] mx-auto border border-border">
                {jobState === 'completed' ? (
                  <video
                    key={generatedOutput.videoUrl}
                    src={generatedOutput.videoUrl}
                    controls
                    loop
                    playsInline
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-5 text-center bg-zinc-950">
                    {/* Blurred Poster Background */}
                    {generatedOutput.clipFrames[0]?.thumbnailUrl && (
                      <img
                        src={generatedOutput.clipFrames[0].thumbnailUrl}
                        alt="Poster"
                        className="absolute inset-0 w-full h-full object-cover opacity-20 filter blur-sm"
                      />
                    )}
                    <div className="relative z-10 space-y-3 max-w-[240px]">
                      <div className="size-9 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin mx-auto" />
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {jobState === 'queued' ? 'ANTREAN RENDER' : 'GOOGLE FLOW RENDERING'}
                        </span>
                        <h4 className="text-xs font-semibold text-white mt-1.5">
                          {jobCompletedSegments > 0
                            ? `Segmen ${jobCompletedSegments}/3 Berhasil Dibuat`
                            : 'Mempersiapkan Rangkaian Video'}
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                          {jobStatusMessage || 'Google Flow sedang merender video kontinuitas multi-segmen...'}
                        </p>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
                          style={{ width: `${Math.max(jobProgress, jobCompletedSegments > 0 ? jobCompletedSegments * 33 : 15)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                        <span>Kontinuitas Multi-Klip</span>
                        <span>{Math.max(jobProgress, jobCompletedSegments * 33)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Deliverable Metadata Badges */}
              <div className="grid grid-cols-3 gap-1 text-[10px] text-center pt-1 font-mono">
                <div className="p-1.5 rounded-md border border-border bg-surface-subtle truncate">
                  <span className="text-muted-foreground block text-[9px]">Karakter</span>
                  <span className="font-semibold text-foreground truncate">{generatedOutput.characterUsed}</span>
                </div>
                <div className="p-1.5 rounded-md border border-border bg-surface-subtle truncate">
                  <span className="text-muted-foreground block text-[9px]">Audio</span>
                  <span className="font-semibold text-foreground truncate">{generatedOutput.voiceUsed}</span>
                </div>
                <div className="p-1.5 rounded-md border border-border bg-surface-subtle truncate">
                  <span className="text-muted-foreground block text-[9px]">CTA</span>
                  <span className="font-semibold text-foreground truncate">{generatedOutput.ctaUsed}</span>
                </div>
              </div>

              {/* Quick Export Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5 cursor-pointer"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = generatedOutput.videoUrl;
                    a.download = `${productName.replace(/\s+/g, '_')}_affiliate.mp4`;
                    a.click();
                  }}
                >
                  <Download className="size-3.5" />
                  <span>Download MP4</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5 cursor-pointer"
                  onClick={() => handleCopy(generatedOutput.caption, 'full_caption')}
                >
                  {copiedText === 'full_caption' ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copiedText === 'full_caption' ? 'Tersalin' : 'Copy caption'}</span>
                </Button>
              </div>

              {/* Deliverable Details Tabs */}
              <div className="pt-2 border-t border-border space-y-2.5">
                <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
                  {[
                    { id: 'frames', label: 'Klip Storyboard (Frames)' },
                    { id: 'script', label: 'Script Breakdown' },
                    { id: 'caption', label: 'Copywriting' },
                    { id: 'hooks', label: 'A/B Hooks' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveOutputTab(tab.id as any)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
                        activeOutputTab === tab.id
                          ? 'bg-surface-subtle text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Klip Storyboard Frames (Spill Frame per Klip) */}
                {activeOutputTab === 'frames' && (
                  <div className="space-y-2.5 text-xs">
                    {generatedOutput.clipFrames.map((clip) => (
                      <div key={clip.clipNumber} className="p-3 rounded-md border border-border bg-surface-subtle space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Film className="size-3.5 text-muted-foreground" />
                            {clip.title}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded-xs border border-border bg-background">
                            {clip.timecode}
                          </span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            {clip.thumbnailUrl ? (
                              <img
                                src={clip.thumbnailUrl}
                                alt={clip.title}
                                className="size-16 rounded-md object-cover border border-border"
                              />
                            ) : (
                              <div className="size-16 rounded-md border border-dashed border-border bg-background flex items-center justify-center text-muted-foreground text-[10px] text-center p-1">
                                No frame
                              </div>
                            )}
                            {clip.isNanoBananaFrame && (
                              <span className="absolute -bottom-1 -right-1 bg-surface-subtle text-foreground border border-border text-[8px] font-mono px-1 rounded shadow-xs">
                                🍌 Nano
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5 text-[11px]">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Visual frame cue:</span>
                              <p className="text-foreground font-medium">{clip.visualCue}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Camera directive:</span>
                              <p className="text-muted-foreground font-mono text-[10px] break-words line-clamp-3">{clip.cameraPrompt}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Audio track:</span>
                              <p className="text-foreground text-[10px] italic">{clip.audioLine}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 2: Script Breakdown */}
                {activeOutputTab === 'script' && (
                  <div className="space-y-2 text-xs">
                    {generatedOutput.scriptBreakdown.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-md border border-border bg-surface-subtle space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="font-semibold text-foreground">{item.shot}</span>
                          <span className="text-muted-foreground">{item.time}</span>
                        </div>
                        <p className="text-xs font-medium text-foreground">{item.dialogue}</p>
                        <p className="text-[10px] text-muted-foreground">{item.direction}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 3: Caption & Hashtags */}
                {activeOutputTab === 'caption' && (
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-md border border-border bg-surface-subtle space-y-1.5">
                      <p className="text-xs text-foreground leading-relaxed">{generatedOutput.caption}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {generatedOutput.hashtags.map((h) => (
                          <span key={h} className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded-xs border border-border">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: A/B Hook Variations */}
                {activeOutputTab === 'hooks' && (
                  <div className="space-y-1.5 text-xs">
                    {generatedOutput.hookAlternatives.map((h, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-md border border-border bg-surface-subtle flex items-start justify-between gap-2"
                      >
                        <p className="text-xs text-foreground font-mono">{h}</p>
                        <button
                          type="button"
                          onClick={() => handleCopy(h, `hook_${i}`)}
                          className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 cursor-pointer pt-0.5"
                        >
                          {copiedText === `hook_${i}` ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Idle Placeholder (Shown before generation) */}
          {!isGenerating && !generatedOutput && (
            <div className="rounded-lg border border-border bg-surface-subtle p-5 text-center space-y-2 select-none">
              <div className="size-8 rounded-full bg-background border border-border mx-auto flex items-center justify-center text-muted-foreground">
                <Video className="size-4" />
              </div>
              <div className="text-xs font-semibold text-foreground">Belum ada render video</div>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                Masukkan data produk, buat draft dan frame referensi, review hasilnya, lalu setujui sebelum render Flow dimulai.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ========================================== */}
      {/* MODAL: Pilih Template Preset               */}
      {/* ========================================== */}
      <Dialog open={isPresetModalOpen} onOpenChange={setIsPresetModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preset Settingan Video</DialogTitle>
            <DialogDescription>
              Pilih preset untuk menerapkan konfigurasi video otomatis, atau gunakan mode manual tanpa preset.
            </DialogDescription>
          </DialogHeader>

          {/* Option: Tanpa Preset (Manual) */}
          <div
            onClick={() => {
              setActivePresetId(null);
              setIsPresetModalOpen(false);
            }}
            className={`p-3 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
              activePresetId === null
                ? 'border-foreground bg-surface-subtle shadow-2xs'
                : 'border-border bg-background hover:bg-surface-hover'
            }`}
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Tanpa Preset (Manual Bebas)</span>
                {activePresetId === null && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-foreground text-background font-medium">
                    Sedang Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tidak menggunakan template. Anda bebas mengatur niche, visual style, hook, karakter, VO, dan CTA sendiri.
              </p>
            </div>
            {activePresetId === null && <Check className="size-4 text-foreground shrink-0" />}
          </div>

          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pt-2">
            Daftar Preset Tersedia:
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[55vh] overflow-y-auto">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id;
              const nicheObj = NICHE_LIST.find((n) => n.id === preset.niche);
              return (
                <div
                  key={preset.id}
                  onClick={() => {
                    handleApplyPreset(preset);
                    setIsPresetModalOpen(false);
                  }}
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'border-foreground bg-surface-subtle shadow-2xs'
                      : 'border-border bg-background hover:bg-surface-hover'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                      {isActive && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-foreground text-background font-medium">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {preset.desc}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border/60 mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded-xs border border-border bg-surface-subtle">
                        {nicheObj?.shortName || preset.niche}
                      </span>
                      <span>{preset.duration}s · {preset.aspectRatio}</span>
                    </div>

                    {preset.isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePreset(preset.id, e)}
                        className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                        title="Hapus preset"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsPresetModalOpen(false);
                setIsSavePresetModalOpen(true);
              }}
              className="text-xs gap-1 cursor-pointer"
            >
              <BookmarkCheck className="size-3.5" />
              <span>Simpan settingan aktif sebagai preset</span>
            </Button>
            <Button size="sm" onClick={() => setIsPresetModalOpen(false)} className="cursor-pointer">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL: Simpan Preset Settingan Baru        */}
      {/* ========================================== */}
      <Dialog open={isSavePresetModalOpen} onOpenChange={setIsSavePresetModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Simpan Preset Settingan</DialogTitle>
            <DialogDescription>
              Menyimpan konfigurasi video saat ini ke dalam preset. Preset hanya menyimpan settingan video, bukan data produk.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Nama preset</span>
              <Input
                placeholder="Contoh: Skincare Pagi TikTok 18s"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Catatan / Deskripsi (Opsional)</span>
              <Input
                placeholder="Contoh: Formula penyesalan untuk serum"
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Transparent Settings Breakdown */}
            <div className="rounded-md border border-border bg-surface-subtle p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <span>Settingan yang akan disimpan:</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-sans">
                  Hanya Settingan
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground font-mono">
                <div>• Niche: <span className="text-foreground font-medium">{NICHE_LIST.find((n) => n.id === selectedNiche)?.shortName}</span></div>
                <div>• Durasi: <span className="text-foreground font-medium">{selectedDuration}s ({aspectRatio})</span></div>
                <div>• Hook: <span className="text-foreground font-medium">{HOOK_ARCHETYPES.find((h) => h.id === selectedHook)?.name}</span></div>
                <div>• Visual: <span className="text-foreground font-medium">{VISUAL_STYLES.find((s) => s.id === selectedStyle)?.title}</span></div>
                <div>• Karakter: <span className="text-foreground font-medium">{characterList.find((c) => c.id === selectedCharacterId)?.name || 'Tanpa Karakter'}</span></div>
                <div>• Voiceover: <span className="text-foreground font-medium">Aktif, dialog Indonesia</span></div>
                <div className="col-span-2">• CTA Trigger: <span className="text-foreground font-medium">{ctaList.find((c) => c.id === selectedCtaId)?.label || 'Aktif'}</span></div>
              </div>

              <div className="pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
                ✓ Foto produk, nama produk, dan deskripsi produk <strong>TIDAK disimpan</strong> ke dalam preset.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSavePresetModalOpen(false)} className="cursor-pointer">
              Batal
            </Button>
            <Button size="sm" onClick={handleSaveCurrentPreset} disabled={!newPresetName.trim()} className="cursor-pointer">
              Simpan Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL: Tambah Karakter (1-2 Foto Upload)   */}
      {/* ========================================== */}
      <Dialog open={isCharModalOpen} onOpenChange={setIsCharModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Karakter Talent</DialogTitle>
            <DialogDescription>
              Upload 1 atau 2 foto referensi karakter untuk konsistensi visual di Google Flow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Nama karakter</span>
                <Input
                  placeholder="Contoh: Sarah / Budi"
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Role / Persona</span>
                <Input
                  placeholder="Contoh: Skincare Specialist"
                  value={newCharRole}
                  onChange={(e) => setNewCharRole(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Demografi</span>
              <Input
                placeholder="Contoh: Wanita 24 th, kasual modern"
                value={newCharDemographics}
                onChange={(e) => setNewCharDemographics(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Two File Upload Slots for Character Consistency */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Photo 1: Face Anchor */}
              <div>
                <input
                  ref={charFaceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleCharFaceFile(e.target.files?.[0] || null)}
                />
                <span className="text-[11px] font-medium text-foreground block mb-1">
                  1. Foto Wajah (Utama) *
                </span>
                {newCharAvatar ? (
                  <div className="relative h-28 rounded-md border border-border overflow-hidden bg-background group">
                    <img src={newCharAvatar} alt="Face" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setNewCharAvatar('')}
                      className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 px-1 rounded-xs bg-black/60 text-[9px] text-white">
                      Wajah
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => charFaceInputRef.current?.click()}
                    className="h-28 w-full rounded-md border border-dashed border-border bg-background hover:bg-surface-hover flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Upload className="size-4 mb-1" />
                    <span className="text-[10px] font-medium">Upload Wajah</span>
                  </button>
                )}
              </div>

              {/* Photo 2: Outfit / Body Anchor (Optional) */}
              <div>
                <input
                  ref={charBodyInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleCharBodyFile(e.target.files?.[0] || null)}
                />
                <span className="text-[11px] font-medium text-foreground block mb-1">
                  2. Foto Outfit (Opsional)
                </span>
                {newCharBodyRef ? (
                  <div className="relative h-28 rounded-md border border-border overflow-hidden bg-background group">
                    <img src={newCharBodyRef} alt="Body" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setNewCharBodyRef('')}
                      className="absolute top-1 right-1 size-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 px-1 rounded-xs bg-black/60 text-[9px] text-white">
                      Outfit/Postur
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => charBodyInputRef.current?.click()}
                    className="h-28 w-full rounded-md border border-dashed border-border bg-background hover:bg-surface-hover flex flex-col items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Upload className="size-4 mb-1" />
                    <span className="text-[10px] font-medium">Upload Postur</span>
                  </button>
                )}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Google Flow Character Prompt</span>
              <textarea
                rows={2}
                placeholder="Deskripsi visual: warna pakaian, ekspresi natural, pencahayaan..."
                value={newCharPrompt}
                onChange={(e) => setNewCharPrompt(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCharModalOpen(false)} className="cursor-pointer">
              Batal
            </Button>
            <Button size="sm" onClick={handleAddCharacter} disabled={!newCharName.trim() || !newCharAvatar} className="cursor-pointer">
              Simpan Karakter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL: Tambah Style Voiceover              */}
      {/* ========================================== */}
      <Dialog open={isVoiceModalOpen} onOpenChange={setIsVoiceModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Style Voiceover</DialogTitle>
            <DialogDescription>
              Konfigurasi tone dan kecepatan intonasi native Google Flow audio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Nama style suara</span>
              <Input
                placeholder="Contoh: Gaya Curhat Santai / Hype Livestream"
                value={newVoiceName}
                onChange={(e) => setNewVoiceName(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Tone & Emosi</span>
                <Input
                  placeholder="Contoh: Sangat antusias & kaget"
                  value={newVoiceTone}
                  onChange={(e) => setNewVoiceTone(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Kecepatan bicara</span>
                <select
                  value={newVoiceCadence}
                  onChange={(e) => setNewVoiceCadence(e.target.value)}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  <option value="0.9x (Santai)">0.9x (Santai)</option>
                  <option value="1.0x (Alami)">1.0x (Alami)</option>
                  <option value="1.15x (Cepat/Review)">1.15x (Cepat/Review)</option>
                  <option value="1.25x (Sangat Hype)">1.25x (Sangat Hype)</option>
                </select>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Google Flow Speech Prompt</span>
              <textarea
                rows={3}
                placeholder="Instruksi delivery suara: artikulasi, dialek bahasa, dinamika pernapasan..."
                value={newVoicePrompt}
                onChange={(e) => setNewVoicePrompt(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsVoiceModalOpen(false)} className="cursor-pointer">
              Batal
            </Button>
            <Button size="sm" onClick={handleAddVoiceStyle} disabled={!newVoiceName.trim()} className="cursor-pointer">
              Simpan Style Voice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL: Tambah Custom CTA                   */}
      {/* ========================================== */}
      <Dialog open={isCtaModalOpen} onOpenChange={setIsCtaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Custom Call to Action (CTA)</DialogTitle>
            <DialogDescription>
              Kustomisasi arahan checkout, gesture talent, dan teks seruan belanja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Label CTA</span>
                <Input
                  placeholder="Contoh: Voucher Diskon 50%"
                  value={newCtaLabel}
                  onChange={(e) => setNewCtaLabel(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Platform</span>
                <select
                  value={newCtaPlatform}
                  onChange={(e) => setNewCtaPlatform(e.target.value)}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  <option value="TikTok Shop">TikTok Shop</option>
                  <option value="Shopee Video">Shopee Video</option>
                  <option value="Instagram / Reels">Instagram / Reels</option>
                  <option value="Tokopedia">Tokopedia</option>
                  <option value="Custom Link">Custom Link / Web</option>
                </select>
              </div>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Aksi Gesture / Visual Cue</span>
              <Input
                placeholder="Contoh: Talent menunjuk pojok kiri bawah dengan senyum meyakinkan"
                value={newCtaGesture}
                onChange={(e) => setNewCtaGesture(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground block mb-1">Kalimat Seruan Script (Dialogue Cue)</span>
              <textarea
                rows={2}
                placeholder="Contoh: Mumpung lagi ada flash sale, buruan klaim kuponnya sekarang!"
                value={newCtaScriptCue}
                onChange={(e) => setNewCtaScriptCue(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCtaModalOpen(false)} className="cursor-pointer">
              Batal
            </Button>
            <Button size="sm" onClick={handleAddCta} disabled={!newCtaLabel.trim()} className="cursor-pointer">
              Simpan CTA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Clock,
  ArrowRight,
} from 'lucide-react';

interface PresetCard {
  id: string;
  name: string;
  category: string;
  recommendedDuration: number;
  bestStyle: string;
  hookFormula: string;
  conversionTip: string;
  exampleProducts: string[];
}

const PRESET_DATA: PresetCard[] = [
  {
    id: 'beauty',
    name: 'Beauty & Skincare',
    category: 'Skincare',
    recommendedDuration: 18,
    bestStyle: 'UGC Testimonial & Macro Texture',
    hookFormula: '"Formula barrier repair untuk merawat skin barrier dan tekstur kulit..."',
    conversionTip: 'Menyorot tetesan serum di pipi atau tekstur gel pada detik 04-08 untuk membuktikan daya serap cepat.',
    exampleProducts: ['Ceramide Barrier Serum', 'Tinted Sunscreen SPF 50', 'Moisturizer Gel', 'Lip Velvet Tint'],
  },
  {
    id: 'fashion',
    name: 'Fashion & Hijab Modest',
    category: 'Fashion',
    recommendedDuration: 20,
    bestStyle: '360 Turnaround Walk & Macro Weave',
    hookFormula: '"Detail material silk premium dengan potongan drape jatuh elegan..."',
    conversionTip: 'Model berjalan anggun 3 detik pertama lalu berputar 360 derajat memperlihatkan potongan punggung dan jatuhnya kain.',
    exampleProducts: ['Gamis Silk Satin Premium', 'Oversized Cotton Tee', 'Pashmina Silk Plisket', 'Korean Knit Cardigan'],
  },
  {
    id: 'gadget',
    name: 'Tech & Electronics',
    category: 'Gadget',
    recommendedDuration: 14,
    bestStyle: 'Problem & Solution / Feature Proof',
    hookFormula: '"Pengujian fitur Active Noise Cancelling dan respon suara earbuds..."',
    conversionTip: 'Tunjukkan suara bising sekitar mendadak senyap begitu earbuds dipasang di telinga.',
    exampleProducts: ['TWS Bluetooth ANC', 'Powerbank Fast Charge 20.000mAh', 'Phone Case Anti-Banting', 'Smartwatch Fitness'],
  },
  {
    id: 'food',
    name: 'Food & Snacks',
    category: 'F&B',
    recommendedDuration: 10,
    bestStyle: 'Special Promotion / Sound Demo',
    hookFormula: '"Penawaran terbatas untuk camilan renyah bumbu daun jeruk..."',
    conversionTip: 'Zoom in tekstur renyah saat camilan dipatahkan dengan audio renyah. Durasi 10s tercepat memicu impulse buy.',
    exampleProducts: ['Baso Goreng Pedas Daun Jeruk', 'Keripik Kaca Pedas Gurih', 'Kopi Bubuk Robusta Blend', 'Bumbu Instan Nasi Goreng'],
  },
  {
    id: 'home',
    name: 'Home & Living',
    category: 'Home & Living',
    recommendedDuration: 18,
    bestStyle: 'Problem Solver & Functional Demo',
    hookFormula: '"Solusi fungsional untuk perlengkapan rumah minimalis..."',
    conversionTip: 'Tampilkan perbandingan sebelum (berantakan/kotor) dan sesudah dibersihkan menggunakan alat dalam 3 detik.',
    exampleProducts: ['Mini Portable USB Blender', 'Sprei Aesthetic Korea', 'Mini Cordless Vacuum', 'Lampu Tidur Sunset Projector'],
  },
  {
    id: 'baby',
    name: 'Mom & Baby',
    category: 'Mom & Baby',
    recommendedDuration: 20,
    bestStyle: 'Honest Review & Comfort Proof',
    hookFormula: '"Rekomendasi perlengkapan bayi dengan material lembut aman untuk kulit..."',
    conversionTip: 'Gunakan nada suara hangat, edukatif, dan penuh empati. Tunjukkan daya serap kapas halus dan elastisitas karet pinggang.',
    exampleProducts: ['Popok Bayi Ultra Lembut', 'UV Sterilizer Botol Susu', 'Minyak Telon Wangi Alami', 'Baju Jumper Katun Bayi'],
  },
];

interface NichePresetsProps {
  onApplyPreset?: (nicheId: string, duration: number) => void;
}

export const NichePresets: React.FC<NichePresetsProps> = ({ onApplyPreset }) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border">
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Niche formulas
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Creative blueprints with hook patterns, pacing targets, and conversion guidelines.
        </p>
      </div>

      {/* Grid of 6 Niche Formulas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRESET_DATA.map((preset) => (
          <div
            key={preset.id}
            className="rounded-lg border border-border bg-surface p-4 flex flex-col justify-between transition-colors hover:border-foreground/30 space-y-4"
          >
            <div className="space-y-3">
              {/* Category & Duration Tags */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-xs border border-border bg-surface-subtle text-foreground">
                  {preset.category}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  {preset.recommendedDuration}s
                </span>
              </div>

              {/* Title & Style */}
              <div>
                <h3 className="text-sm font-semibold text-foreground tracking-tight">
                  {preset.name}
                </h3>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Ideal style: {preset.bestStyle}
                </div>
              </div>

              {/* Hook Container */}
              <div className="p-3 rounded-md bg-code-bg border border-border space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Hook opening
                </div>
                <p className="text-xs text-foreground font-mono leading-relaxed">
                  {preset.hookFormula}
                </p>
              </div>

              {/* Conversion Rule */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-foreground">
                  Conversion guideline
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {preset.conversionTip}
                </p>
              </div>

              {/* Example Target Products */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium text-foreground">
                  Product categories
                </div>
                <div className="flex flex-wrap gap-1">
                  {preset.exampleProducts.map((p, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] px-2 py-0.5 rounded-xs border border-border bg-surface-subtle text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onApplyPreset?.(preset.id, preset.recommendedDuration)}
              >
                <span>Apply formula to studio</span>
                <ArrowRight className="size-3 ml-1" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

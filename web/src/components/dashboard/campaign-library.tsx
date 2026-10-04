import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Play,
  Download,
  Copy,
  Check,
  Search,
  Film,
  Clock,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';

interface CampaignItem {
  id: string;
  productName: string;
  niche: string;
  duration: number;
  date: string;
  videoUrl: string;
  thumbnail: string;
  caption: string;
  style: string;
}

const INITIAL_CAMPAIGNS: CampaignItem[] = [
  {
    id: 'camp_001',
    productName: 'Glowing Barrier Serum 30ml',
    niche: 'Beauty & Skincare',
    duration: 18,
    date: 'Today, 14:20',
    videoUrl: '/master.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop&q=80',
    caption: 'Glowing Barrier Serum dengan 5X Ceramide untuk merawat skin barrier. Dapatkan penawaran promo hari ini. #Skincare #Ceramide',
    style: 'UGC Testimonial',
  },
  {
    id: 'camp_002',
    productName: 'Gamis Silk Sage Green Premium',
    niche: 'Fashion & Hijab',
    duration: 20,
    date: 'Yesterday, 19:45',
    videoUrl: '/master.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=600&auto=format&fit=crop&q=80',
    caption: 'Gamis silk dengan potongan jatuh anggun dan bahan lembut. Dapatkan penawaran khusus hari ini. #Fashion #Hijab',
    style: 'Product Showcase',
  },
  {
    id: 'camp_003',
    productName: 'TWS Bluetooth Earbuds ANC Pro',
    niche: 'Gadget & Electronics',
    duration: 14,
    date: '30 Sep 2026',
    videoUrl: '/master.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80',
    caption: 'TWS dengan Active Noise Cancelling terintegrasi dan daya tahan baterai 32 jam. #Gadget #TWS',
    style: 'Problem & Solution',
  },
  {
    id: 'camp_004',
    productName: 'Baso Goreng Pedas Daun Jeruk 250g',
    niche: 'Food & Snacks',
    duration: 10,
    date: '29 Sep 2026',
    videoUrl: '/master.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
    caption: 'Baso goreng renyah dengan racikan bumbu pedas daun jeruk. Dapatkan promo terbatas sekarang. #Kuliner #Snack',
    style: 'Special Promotion',
  },
];

export const CampaignLibrary: React.FC = () => {
  const [campaigns] = useState<CampaignItem[]>(INITIAL_CAMPAIGNS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [previewItem, setPreviewItem] = useState<CampaignItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filterOptions = [
    { id: 'all', label: 'All niches' },
    { id: 'Beauty & Skincare', label: 'Beauty' },
    { id: 'Fashion & Hijab', label: 'Fashion' },
    { id: 'Gadget & Electronics', label: 'Gadget' },
    { id: 'Food & Snacks', label: 'Food' },
  ];

  const filteredCampaigns = campaigns.filter((item) => {
    if (selectedFilter !== 'all' && item.niche !== selectedFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.productName.toLowerCase().includes(q) ||
        item.niche.toLowerCase().includes(q) ||
        item.style.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyCaption = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* List Page Header */}
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Campaign library
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rendered videos, transcripts, and export assets.
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2">
          <div className="inline-flex h-8 items-center rounded-md bg-muted/50 p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-xs text-xs transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-background text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Table view"
            >
              <ListIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-xs text-xs transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-background text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Niche Segments */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedFilter(opt.id)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                selectedFilter === opt.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Compact Search Input */}
        <div className="w-full sm:w-64 relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="pl-8 h-8 text-xs font-sans"
          />
        </div>
      </div>

      {/* Main Campaign Data Display */}
      {filteredCampaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-2">
          <Film className="size-8 mx-auto text-muted-foreground" />
          <div className="text-xs font-medium text-foreground">No campaigns found</div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No video exports match your search criteria. Try a different query or generate one in Studio.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* First-Class Table View */
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[320px]">Product</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Style</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((camp) => (
                <TableRow key={camp.id} className="cursor-pointer" onClick={() => setPreviewItem(camp)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={camp.thumbnail}
                        alt={camp.productName}
                        className="size-9 rounded-md object-cover border border-border shrink-0"
                      />
                      <div className="truncate">
                        <span className="text-xs font-medium text-foreground block truncate">
                          {camp.productName}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {camp.id}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {camp.niche}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {camp.style}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-foreground">
                    {camp.duration}s
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {camp.date}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPreviewItem(camp)}
                      >
                        <Play className="size-3 mr-1" />
                        <span>Play</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopyCaption(camp.id, camp.caption)}
                        title="Copy caption"
                      >
                        {copiedId === camp.id ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = camp.videoUrl;
                          a.download = `${camp.id}_${camp.duration}s.mp4`;
                          a.click();
                        }}
                        title="Download MP4"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Restrained Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="rounded-lg border border-border bg-surface overflow-hidden flex flex-col justify-between transition-colors hover:border-foreground/30 group"
            >
              {/* Media Thumbnail */}
              <div
                className="relative aspect-[9/12] w-full bg-black/40 overflow-hidden cursor-pointer"
                onClick={() => setPreviewItem(camp)}
              >
                <img
                  src={camp.thumbnail}
                  alt={camp.productName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-black/70 text-white border border-white/10">
                    {camp.duration}s
                  </span>
                </div>
                <div className="absolute top-2 left-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-black/70 text-white border border-white/10">
                    {camp.niche.split(' ')[0]}
                  </span>
                </div>

                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="size-9 rounded-full bg-white text-black flex items-center justify-center">
                    <Play className="size-3.5 fill-black ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Info & Footer */}
              <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-foreground line-clamp-1">
                    {camp.productName}
                  </h3>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>{camp.style}</span>
                    <span>{camp.date}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setPreviewItem(camp)}
                  >
                    <Play className="size-3 mr-1" />
                    <span>View</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopyCaption(camp.id, camp.caption)}
                    title="Copy caption"
                  >
                    {copiedId === camp.id ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = camp.videoUrl;
                      a.download = `${camp.id}_${camp.duration}s.mp4`;
                      a.click();
                    }}
                    title="Download MP4"
                  >
                    <Download className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Preview Modal */}
      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between pr-4">
              <DialogTitle className="truncate max-w-[280px]">
                {previewItem?.productName}
              </DialogTitle>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs border border-border text-muted-foreground">
                {previewItem?.duration}s export
              </span>
            </div>
            <DialogDescription>
              {previewItem?.niche} &bull; {previewItem?.style}
            </DialogDescription>
          </DialogHeader>

          {previewItem && (
            <div className="space-y-3 pt-1">
              <div className="rounded-lg overflow-hidden border border-border bg-black flex items-center justify-center max-h-[380px]">
                <video
                  src={previewItem.videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="max-h-[380px] w-full object-contain"
                />
              </div>

              {/* Caption Box */}
              <div className="p-3 rounded-md bg-surface-subtle border border-border text-xs space-y-1">
                <div className="flex justify-between items-center text-[11px] font-semibold text-foreground">
                  <span>TikTok caption text</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCaption('modal', previewItem.caption)}
                    className="text-xs text-foreground hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'modal' ? 'Copied' : 'Copy text'}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                  {previewItem.caption}
                </p>
              </div>

              {/* Footer Button */}
              <Button
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewItem.videoUrl;
                  a.download = `${previewItem.id}_${previewItem.duration}s.mp4`;
                  a.click();
                }}
              >
                <Download className="size-3.5 mr-1" />
                <span>Download video (MP4)</span>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Crown,
  Dices,
  LogOut,
  Menu,
  MessageSquareText,
  Music,
  Settings,
  Share2,
  Smile,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * App icon set. Controls use these names instead of emoji or text glyphs:
 *
 * | name        | replaces                         | lucide             |
 * |-------------|----------------------------------|--------------------|
 * | sound-on    | 🔊 sound toggle (unmuted)        | Volume2            |
 * | sound-off   | 🔇 sound toggle (muted)          | VolumeX            |
 * | music       | "Nhạc nền" switch                | Music              |
 * | menu        | "Menu" button in a match         | Menu               |
 * | leave       | "Rời phòng" button               | LogOut             |
 * | copy-link   | "Sao chép liên kết" button       | Copy               |
 * | share       | "Chia sẻ" button                 | Share2             |
 * | rules       | "Luật chơi" button               | BookOpen           |
 * | settings    | "Cài đặt ván" / settings entry   | Settings           |
 * | feedback    | "Góp ý" entry                    | MessageSquareText  |
 * | emote       | 💬 emote picker button           | Smile              |
 * | close       | "Đóng" / ✕ on dialogs and sheets | X                  |
 * | back        | "Quay lại" / back to lobby       | ArrowLeft          |
 * | dice        | "Đổ xúc xắc" roll button         | Dices              |
 * | user        | player / account                 | User               |
 * | crown       | host badge, winner               | Crown              |
 * | win         | win dialog / ranking             | Trophy             |
 * | check       | confirmed / copied               | Check              |
 */
const ICONS = {
  'sound-on': Volume2,
  'sound-off': VolumeX,
  music: Music,
  menu: Menu,
  leave: LogOut,
  'copy-link': Copy,
  share: Share2,
  rules: BookOpen,
  settings: Settings,
  feedback: MessageSquareText,
  emote: Smile,
  close: X,
  back: ArrowLeft,
  dice: Dices,
  user: User,
  crown: Crown,
  win: Trophy,
  check: Check,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Pixel sizes; md matches body text inside a 48px control. */
const SIZES = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

export type IconSize = keyof typeof SIZES;

/** Rendered stroke in px, kept equal across sizes (lucide scales stroke with its 24px viewBox). */
const STROKE_PX = 1.75;

interface IconProps {
  name: IconName;
  size?: IconSize;
  /** Accessible name. Omit when the icon sits next to visible text or inside a labelled control. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 'md', label, className }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      size={SIZES[size]}
      strokeWidth={(STROKE_PX * 24) / SIZES[size]}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}

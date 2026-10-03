"use client";

import {
  Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Beaker, Bolt,
  BarChart3, BookOpen, Bot, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CirclePause, Clipboard, Copy, Database, Download, Eye, EyeOff, FileText,
  Gauge, Gavel, GitBranch, GripVertical, Image, KeyRound, Languages, Layers3,
  Link2, Link2Off, Lock, LogOut, Menu, MessageSquare, HeartPulse, Moon, MoreHorizontal, Network,
  PanelLeft, Pause, Play, Plus, Power, RefreshCw, Route, Search, Send, Settings, Shuffle,
  Shield, Square, SquareTerminal, StopCircle, Sun, Trash2, Upload, User, X,
  Zap, Cookie, FileUp, XCircle, ExternalLink,
} from "lucide-react";

const ICONS = {
  add: Plus, api: Link2, account_tree: GitBranch, arrow_downward: ArrowDown,
  arrow_upward: ArrowUp, arrow_back: ArrowLeft, arrow_forward: ArrowRight,
  bar_chart: BarChart3, bolt: Bolt, cancel: XCircle, check: Check, check_circle: CheckCircle2,
  chevron_down: ChevronDown, chevron_left: ChevronLeft, chevron_right: ChevronRight,
  close: X, content_copy: Copy, copy: Copy, data_usage: Gauge, delete: Trash2,
  cookie: Cookie, description: FileText, dns: Database, edit: Settings, error: AlertCircle,
  download: Download, expand_more: ChevronDown, extension: Zap, gavel: Gavel, graphic_eq: Activity,
  grid_view: Layers3, history: PanelLeft, image: Image, info: AlertCircle,
  key: KeyRound, language: Languages, layers: Layers3, lan: Network,
  link_off: Link2Off, lock: Lock, logout: LogOut, menu: Menu, menu_book: BookOpen, moon: Moon,
  monitor_heart: HeartPulse, more_horiz: MoreHorizontal, open_in_new: ExternalLink, pause: Pause, pause_circle: CirclePause,
  perm_media: Image, person: User, play_arrow: Play, power_settings_new: Power,
  progress_activity: RefreshCw, query_stats: BarChart3, refresh: RefreshCw,
  route: Route, savings: Zap, science: Beaker, search: Search, search_off: Search, send: Send, sync_alt: Shuffle,
  settings: Settings, shield: Shield, stop: Square, terminal: SquareTerminal,
  translate: Languages, upload: Upload, upload_file: FileUp, visibility: Eye, visibility_off: EyeOff,
  warning: AlertTriangle, chat: MessageSquare, smart_toy: Bot, sun: Sun,
};

export default function Icon({ name, size = 18, strokeWidth = 1.75, className = "", ...props }) {
  const Component = ICONS[name] || AlertCircle;
  return <Component aria-hidden="true" size={size} strokeWidth={strokeWidth} className={className} {...props} />;
}

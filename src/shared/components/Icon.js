"use client";

// Deep per-icon imports (not the barrel): keeps dev compile + cold-start
// memory proportional to icons used, not the whole 1500-icon library.
import Activity from "lucide-react/dist/esm/icons/activity";
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import Beaker from "lucide-react/dist/esm/icons/beaker";
import Bolt from "lucide-react/dist/esm/icons/bolt";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import Bot from "lucide-react/dist/esm/icons/bot";
import Check from "lucide-react/dist/esm/icons/check";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import CirclePause from "lucide-react/dist/esm/icons/circle-pause";
import Clipboard from "lucide-react/dist/esm/icons/clipboard";
import Copy from "lucide-react/dist/esm/icons/copy";
import Database from "lucide-react/dist/esm/icons/database";
import Download from "lucide-react/dist/esm/icons/download";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Gauge from "lucide-react/dist/esm/icons/gauge";
import Gavel from "lucide-react/dist/esm/icons/gavel";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical";
import Image from "lucide-react/dist/esm/icons/image";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import Languages from "lucide-react/dist/esm/icons/languages";
import Layers3 from "lucide-react/dist/esm/icons/layers-3";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import Link2Off from "lucide-react/dist/esm/icons/link-2-off";
import Lock from "lucide-react/dist/esm/icons/lock";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import Menu from "lucide-react/dist/esm/icons/menu";
import MessageSquare from "lucide-react/dist/esm/icons/message-square";
import HeartPulse from "lucide-react/dist/esm/icons/heart-pulse";
import Moon from "lucide-react/dist/esm/icons/moon";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Network from "lucide-react/dist/esm/icons/network";
import PanelLeft from "lucide-react/dist/esm/icons/panel-left";
import Pause from "lucide-react/dist/esm/icons/pause";
import Play from "lucide-react/dist/esm/icons/play";
import Plus from "lucide-react/dist/esm/icons/plus";
import Power from "lucide-react/dist/esm/icons/power";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Route from "lucide-react/dist/esm/icons/route";
import Search from "lucide-react/dist/esm/icons/search";
import Send from "lucide-react/dist/esm/icons/send";
import Settings from "lucide-react/dist/esm/icons/settings";
import Shuffle from "lucide-react/dist/esm/icons/shuffle";
import Shield from "lucide-react/dist/esm/icons/shield";
import Square from "lucide-react/dist/esm/icons/square";
import SquareTerminal from "lucide-react/dist/esm/icons/square-terminal";
import StopCircle from "lucide-react/dist/esm/icons/stop-circle";
import Sun from "lucide-react/dist/esm/icons/sun";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Upload from "lucide-react/dist/esm/icons/upload";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import Zap from "lucide-react/dist/esm/icons/zap";
import Cookie from "lucide-react/dist/esm/icons/cookie";
import FileUp from "lucide-react/dist/esm/icons/file-up";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Cloud from "lucide-react/dist/esm/icons/cloud";
import Rocket from "lucide-react/dist/esm/icons/rocket";
import Triangle from "lucide-react/dist/esm/icons/triangle";
import AppWindow from "lucide-react/dist/esm/icons/app-window";
import Ban from "lucide-react/dist/esm/icons/ban";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import CloudOff from "lucide-react/dist/esm/icons/cloud-off";
import FilterX from "lucide-react/dist/esm/icons/filter-x";
import Hourglass from "lucide-react/dist/esm/icons/hourglass";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import RadioTower from "lucide-react/dist/esm/icons/radio-tower";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import BadgeCheck from "lucide-react/dist/esm/icons/badge-check";
import Braces from "lucide-react/dist/esm/icons/braces";
import Building2 from "lucide-react/dist/esm/icons/building-2";
import CirclePlay from "lucide-react/dist/esm/icons/circle-play";
import Code2 from "lucide-react/dist/esm/icons/code-2";
import Heart from "lucide-react/dist/esm/icons/heart";
import LockOpen from "lucide-react/dist/esm/icons/lock-open";
import Monitor from "lucide-react/dist/esm/icons/monitor";
import Save from "lucide-react/dist/esm/icons/save";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Star from "lucide-react/dist/esm/icons/star";


const ICONS = {
  add: Plus, api: Link2, account_circle: User, account_tree: GitBranch, arrow_downward: ArrowDown,
  arrow_upward: ArrowUp, arrow_back: ArrowLeft, arrow_forward: ArrowRight,
  bar_chart: BarChart3, bolt: Bolt, business: Building2, cancel: XCircle, check: Check, check_circle: CheckCircle2,
  chevron_down: ChevronDown, chevron_left: ChevronLeft, chevron_right: ChevronRight,
  close: X, code: Code2, computer: Monitor, content_copy: Copy, copy: Copy, data_object: Braces, data_usage: Gauge, delete: Trash2,
  cookie: Cookie, description: FileText, dns: Database, edit: Settings, error: AlertCircle,
  download: Download, expand_more: ChevronDown, extension: Zap, file_upload: FileUp, gavel: Gavel, graphic_eq: Activity,
  grid_view: Layers3, history: PanelLeft, image: Image, info: AlertCircle,
  hub: Network, key: KeyRound, language: Languages, layers: Layers3, lan: Network,
  link_off: Link2Off, lock: Lock, lock_open: LockOpen, logout: LogOut, menu: Menu, menu_book: BookOpen, moon: Moon,
  monitor_heart: HeartPulse, more_horiz: MoreHorizontal, open_in_new: ExternalLink, pause: Pause, pause_circle: CirclePause,
  perm_media: Image, person: User, play_arrow: Play, play_circle: CirclePlay, power_settings_new: Power,
  progress_activity: RefreshCw, query_stats: BarChart3, refresh: RefreshCw, restore: RotateCcw,
  route: Route, savings: Zap, science: Beaker, search: Search, search_off: Search, send: Send, sync_alt: Shuffle,
  save: Save, security: Shield, settings: Settings, shield: Shield, shield_lock: ShieldCheck, star: Star, stop: Square, terminal: SquareTerminal,
  translate: Languages, upload: Upload, upload_file: FileUp, visibility: Eye, visibility_off: EyeOff,
  warning: AlertTriangle, chat: MessageSquare, smart_toy: Bot, sun: Sun,
  apps: AppWindow, block: Ban, checklist: ListChecks, cloud: Cloud, cloud_off: CloudOff,
  cloud_upload: Cloud, expand_less: ChevronDown, filter_alt_off: FilterX, health_and_safety: HeartPulse,
  hourglass_top: Hourglass, restart_alt: RotateCcw, rocket_launch: Rocket, schedule: Clock3,
  toggle_off: Square, toggle_on: CheckCircle2, triangle: Triangle, verified_user: BadgeCheck, volunteer_activism: Heart, wifi_tethering: RadioTower,
};

export default function Icon({ name, size = 18, strokeWidth = 1.75, className = "", ...props }) {
  const Component = ICONS[name] || AlertCircle;
  return <Component aria-hidden="true" size={size} strokeWidth={strokeWidth} className={className} {...props} />;
}

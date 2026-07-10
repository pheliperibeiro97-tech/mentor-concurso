// Sistema de ícones único (Lucide, monocromático) — substitui os 3 dialetos antigos
// (glifos geométricos ◷▣◈, emojis 🎨🔔🤖 e símbolos de botão ▶✨⚙).
//
// Os SVGs entram como string via "?raw" (o Vite faz tree-shake: só os importados vão
// para o bundle). O helper injeta classe + acessibilidade e remove width/height fixos,
// deixando o tamanho por conta do CSS (.ico dimensiona em 1em e herda currentColor).
import clock3 from "lucide-static/icons/clock-3.svg?raw";
import calendarDays from "lucide-static/icons/calendar-days.svg?raw";
import trendingUp from "lucide-static/icons/trending-up.svg?raw";
import compass from "lucide-static/icons/compass.svg?raw";
import listChecks from "lucide-static/icons/list-checks.svg?raw";
import library from "lucide-static/icons/library.svg?raw";
import scrollText from "lucide-static/icons/scroll-text.svg?raw";
import scale from "lucide-static/icons/scale.svg?raw";
import pencilLine from "lucide-static/icons/pencil-line.svg?raw";
import checkCheck from "lucide-static/icons/check-check.svg?raw";
import squarePen from "lucide-static/icons/square-pen.svg?raw";
import layers from "lucide-static/icons/layers.svg?raw";
import repeat2 from "lucide-static/icons/repeat-2.svg?raw";
import flag from "lucide-static/icons/flag.svg?raw";
import fileText from "lucide-static/icons/file-text.svg?raw";
import network from "lucide-static/icons/network.svg?raw";
import settings from "lucide-static/icons/settings.svg?raw";
import circleHelp from "lucide-static/icons/circle-help.svg?raw";
import rocket from "lucide-static/icons/rocket.svg?raw";
// Selos de origem
import bookOpen from "lucide-static/icons/book-open.svg?raw";
import bot from "lucide-static/icons/bot.svg?raw";
import notebookPen from "lucide-static/icons/notebook-pen.svg?raw";
import landmark from "lucide-static/icons/landmark.svg?raw";
// Configurações + Hoje (cabeçalhos de seção e botões)
import palette from "lucide-static/icons/palette.svg?raw";
import bell from "lucide-static/icons/bell.svg?raw";
import target from "lucide-static/icons/target.svg?raw";
import gauge from "lucide-static/icons/gauge.svg?raw";
import puzzle from "lucide-static/icons/puzzle.svg?raw";
import graduationCap from "lucide-static/icons/graduation-cap.svg?raw";
import lifeBuoy from "lucide-static/icons/life-buoy.svg?raw";
import lightbulb from "lucide-static/icons/lightbulb.svg?raw";
import database from "lucide-static/icons/database.svg?raw";
import triangleAlert from "lucide-static/icons/triangle-alert.svg?raw";
import trash2 from "lucide-static/icons/trash-2.svg?raw";
import plugZap from "lucide-static/icons/plug-zap.svg?raw";
import highlighter from "lucide-static/icons/highlighter.svg?raw";
import wrench from "lucide-static/icons/wrench.svg?raw";
import bookMarked from "lucide-static/icons/book-marked.svg?raw";
import mapPin from "lucide-static/icons/map-pin.svg?raw";
import listTree from "lucide-static/icons/list-tree.svg?raw";
import dumbbell from "lucide-static/icons/dumbbell.svg?raw";
import tags from "lucide-static/icons/tags.svg?raw";
import fileClock from "lucide-static/icons/file-clock.svg?raw";
import calendarCheck from "lucide-static/icons/calendar-check.svg?raw";
import brain from "lucide-static/icons/brain.svg?raw";
import map from "lucide-static/icons/map.svg?raw";
import clipboardList from "lucide-static/icons/clipboard-list.svg?raw";
import copy from "lucide-static/icons/copy.svg?raw";
import flame from "lucide-static/icons/flame.svg?raw";
import calendar from "lucide-static/icons/calendar.svg?raw";
import hand from "lucide-static/icons/hand.svg?raw";
// Edital + Planejamento
import sparkles from "lucide-static/icons/sparkles.svg?raw";
import wandSparkles from "lucide-static/icons/wand-sparkles.svg?raw";
import repeat from "lucide-static/icons/repeat.svg?raw";
import globe from "lucide-static/icons/globe.svg?raw";
import paperclip from "lucide-static/icons/paperclip.svg?raw";
import tag from "lucide-static/icons/tag.svg?raw";
import plus from "lucide-static/icons/plus.svg?raw";
import minus from "lucide-static/icons/minus.svg?raw";
import shuffle from "lucide-static/icons/shuffle.svg?raw";
import check from "lucide-static/icons/check.svg?raw";
import download from "lucide-static/icons/download.svg?raw";
import star from "lucide-static/icons/star.svg?raw";
import link from "lucide-static/icons/link.svg?raw";
import pin from "lucide-static/icons/pin.svg?raw";
import zap from "lucide-static/icons/zap.svg?raw";
import alarmClock from "lucide-static/icons/alarm-clock.svg?raw";
import messageSquare from "lucide-static/icons/message-square.svg?raw";
import moon from "lucide-static/icons/moon.svg?raw";
import printer from "lucide-static/icons/printer.svg?raw";
import bookmark from "lucide-static/icons/bookmark.svg?raw";
import files from "lucide-static/icons/files.svg?raw";
// Materiais + Lei Seca + Questões + Acompanhamento
import eye from "lucide-static/icons/eye.svg?raw";
import eyeOff from "lucide-static/icons/eye-off.svg?raw";
import expand from "lucide-static/icons/expand.svg?raw";
import search from "lucide-static/icons/search.svg?raw";
import lock from "lucide-static/icons/lock.svg?raw";
import hourglass from "lucide-static/icons/hourglass.svg?raw";
import image from "lucide-static/icons/image.svg?raw";
import frown from "lucide-static/icons/frown.svg?raw";
import smile from "lucide-static/icons/smile.svg?raw";
import laugh from "lucide-static/icons/laugh.svg?raw";
import dices from "lucide-static/icons/dices.svg?raw";
import partyPopper from "lucide-static/icons/party-popper.svg?raw";
// Revisão/IA + Simulado + onboarding
import skipForward from "lucide-static/icons/skip-forward.svg?raw";
import camera from "lucide-static/icons/camera.svg?raw";
import ban from "lucide-static/icons/ban.svg?raw";
import circleX from "lucide-static/icons/circle-x.svg?raw";
import bandage from "lucide-static/icons/bandage.svg?raw";
import maximize2 from "lucide-static/icons/maximize-2.svg?raw";
// Cross-cutting (chat, store, marcação, main)
import send from "lucide-static/icons/send.svg?raw";
import folderOpen from "lucide-static/icons/folder-open.svg?raw";
import trendingDown from "lucide-static/icons/trending-down.svg?raw";
import eraser from "lucide-static/icons/eraser.svg?raw";
// Controles genéricos (fechar, mídia, navegação, ações) — substituem emojis/glifos avulsos
import x from "lucide-static/icons/x.svg?raw";
import play from "lucide-static/icons/play.svg?raw";
import keyboard from "lucide-static/icons/keyboard.svg?raw";
import pause from "lucide-static/icons/pause.svg?raw";
import refreshCw from "lucide-static/icons/refresh-cw.svg?raw";
import rotateCcw from "lucide-static/icons/rotate-ccw.svg?raw";
import arrowLeft from "lucide-static/icons/arrow-left.svg?raw";
import arrowRight from "lucide-static/icons/arrow-right.svg?raw";
import arrowUp from "lucide-static/icons/arrow-up.svg?raw";
import arrowDown from "lucide-static/icons/arrow-down.svg?raw";
import chevronUp from "lucide-static/icons/chevron-up.svg?raw";
import info from "lucide-static/icons/info.svg?raw";
import chevronDown from "lucide-static/icons/chevron-down.svg?raw";
import chevronRight from "lucide-static/icons/chevron-right.svg?raw";
import gripVertical from "lucide-static/icons/grip-vertical.svg?raw";
import cornerDownRight from "lucide-static/icons/corner-down-right.svg?raw";
import chevronLeft from "lucide-static/icons/chevron-left.svg?raw";
import chevronsLeft from "lucide-static/icons/chevrons-left.svg?raw";
import menu from "lucide-static/icons/menu.svg?raw";
import inbox from "lucide-static/icons/inbox.svg?raw";
import zoomIn from "lucide-static/icons/zoom-in.svg?raw";
import zoomOut from "lucide-static/icons/zoom-out.svg?raw";
import moveHorizontal from "lucide-static/icons/move-horizontal.svg?raw";
import barChart3 from "lucide-static/icons/bar-chart-3.svg?raw";
import ellipsis from "lucide-static/icons/ellipsis.svg?raw";
import externalLink from "lucide-static/icons/external-link.svg?raw";
import upload from "lucide-static/icons/upload.svg?raw";
import minimize2 from "lucide-static/icons/minimize-2.svg?raw";
import arrowLeftRight from "lucide-static/icons/arrow-left-right.svg?raw";
import cloud from "lucide-static/icons/cloud.svg?raw";
import table from "lucide-static/icons/table.svg?raw";
// Editor de texto rico (Resumos)
import bold from "lucide-static/icons/bold.svg?raw";
import italic from "lucide-static/icons/italic.svg?raw";
import underline from "lucide-static/icons/underline.svg?raw";
import strikethrough from "lucide-static/icons/strikethrough.svg?raw";
import list from "lucide-static/icons/list.svg?raw";
import listOrdered from "lucide-static/icons/list-ordered.svg?raw";
import listFilter from "lucide-static/icons/list-filter.svg?raw";
import slidersHorizontal from "lucide-static/icons/sliders-horizontal.svg?raw";
import stickyNote from "lucide-static/icons/sticky-note.svg?raw";
import typeIcon from "lucide-static/icons/type.svg?raw";
import layoutPanelTop from "lucide-static/icons/layout-panel-top.svg?raw";
import indentIncrease from "lucide-static/icons/indent-increase.svg?raw";
import indentDecrease from "lucide-static/icons/indent-decrease.svg?raw";
import heading from "lucide-static/icons/heading.svg?raw";

const MAPA = {
  "clock-3": clock3,
  "calendar-days": calendarDays,
  "trending-up": trendingUp,
  compass,
  "list-checks": listChecks,
  library,
  "scroll-text": scrollText,
  scale,
  "pencil-line": pencilLine,
  "check-check": checkCheck,
  "square-pen": squarePen,
  layers,
  "repeat-2": repeat2,
  flag,
  "file-text": fileText,
  network,
  settings,
  "circle-help": circleHelp,
  rocket,
  "book-open": bookOpen,
  bot,
  "notebook-pen": notebookPen,
  landmark,
  palette,
  bell,
  target,
  gauge,
  puzzle,
  "graduation-cap": graduationCap,
  "life-buoy": lifeBuoy,
  lightbulb,
  database,
  "triangle-alert": triangleAlert,
  "trash-2": trash2,
  "plug-zap": plugZap,
  highlighter,
  wrench,
  "book-marked": bookMarked,
  "map-pin": mapPin,
  "list-tree": listTree,
  dumbbell,
  tags,
  "file-clock": fileClock,
  "calendar-check": calendarCheck,
  brain,
  map,
  "clipboard-list": clipboardList,
  copy,
  flame,
  calendar,
  hand,
  sparkles,
  "wand-sparkles": wandSparkles,
  repeat,
  globe,
  paperclip,
  tag,
  plus,
  minus,
  shuffle,
  check,
  download,
  star,
  link,
  pin,
  zap,
  "alarm-clock": alarmClock,
  "message-square": messageSquare,
  moon,
  printer,
  bookmark,
  files,
  eye,
  "eye-off": eyeOff,
  expand,
  search,
  lock,
  hourglass,
  image,
  frown,
  smile,
  laugh,
  dices,
  "party-popper": partyPopper,
  "skip-forward": skipForward,
  camera,
  ban,
  "circle-x": circleX,
  bandage,
  "maximize-2": maximize2,
  send,
  "folder-open": folderOpen,
  "trending-down": trendingDown,
  eraser,
  x,
  play,
  keyboard,
  pause,
  "refresh-cw": refreshCw,
  "rotate-ccw": rotateCcw,
  "arrow-left": arrowLeft,
  "arrow-right": arrowRight,
  "arrow-up": arrowUp,
  "arrow-down": arrowDown,
  "chevron-down": chevronDown,
  "chevron-up": chevronUp,
  "chevron-right": chevronRight,
  info,
  "grip-vertical": gripVertical,
  "corner-down-right": cornerDownRight,
  "chevron-left": chevronLeft,
  "chevrons-left": chevronsLeft,
  menu,
  inbox,
  "zoom-in": zoomIn,
  "zoom-out": zoomOut,
  "move-horizontal": moveHorizontal,
  "bar-chart-3": barChart3,
  ellipsis,
  "external-link": externalLink,
  upload,
  "minimize-2": minimize2,
  "arrow-left-right": arrowLeftRight,
  cloud,
  table,
  bold,
  italic,
  underline,
  strikethrough,
  list,
  "list-ordered": listOrdered,
  "list-filter": listFilter,
  "sliders-horizontal": slidersHorizontal,
  "sticky-note": stickyNote,
  "type": typeIcon,
  "layout-panel-top": layoutPanelTop,
  "indent-increase": indentIncrease,
  "indent-decrease": indentDecrease,
  heading,
};

// Retorna o SVG do ícone como string, pronto p/ injetar em innerHTML/template.
// nome: chave do MAPA. cls: classes extras. Tamanho/cor vêm do CSS (.ico + currentColor).
export function icone(nome, cls = "") {
  let svg = MAPA[nome];
  if (!svg) return ""; // ícone desconhecido: não quebra o render
  // Os SVGs do lucide-static vêm com um comentário de licença, já têm class="lucide …"
  // e width/height="24" fixos. Removemos o comentário, MESCLAMOS a classe .ico na que já
  // existe (em vez de duplicar o atributo) e tiramos width/height para o CSS dimensionar.
  return svg
    .replace(/<!--[\s\S]*?-->/, "")
    .replace(/\s*width="24"/, "")
    .replace(/\s*height="24"/, "")
    .replace(/class="lucide/, `class="ico ${cls} lucide`)
    .trim();
}

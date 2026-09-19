export interface IndexState {
  readonly activeId: string;
  readonly activeIndex: number;
  readonly activeContentId: string;
  readonly activeContentIndex: number;
  readonly size: number;
}

export interface ScrollState extends IndexState {
  /** Compatibility alias of targetId. Empty after completion/cancellation. */
  readonly pendingId: string;
  readonly targetId: string;
  /** Last confirmed aligned stop; this does not imply the viewport is still there. */
  readonly settledId: string;
  readonly moving: boolean;
  readonly navigationLocked: boolean;
  readonly wheelLocked: boolean;
  readonly touchLocked: boolean;
  /** Union of navigationLocked, wheelLocked and touchLocked. */
  readonly locked: boolean;
  readonly mounted: boolean;
  readonly aligning: boolean;
}

export interface StopContext {
  window: Window;
  document: Document;
  stop: Stop;
  viewportHeight: number;
  scrollY: number;
  documentBottom: number;
}

export interface Stop {
  readonly id: string;
  readonly role?: 'content' | 'auxiliary';
  readonly element?: Element;
  readonly eventRegion?: Element;
  readonly observe?: boolean;
  readonly align?: 'start' | 'end' | 'document-end';
  readonly getTop?: (context: StopContext) => number | null;
  readonly activationTolerance?: number | ((context: { stop: Stop; viewportHeight: number }) => number);
  readonly contentAnchor?: string | ((context: { stop: Stop; stops: Stop[]; activeContentId: string }) => string);
  readonly scroll?: (context: { behavior: ScrollBehavior; top: number; window: Window; document: Document; stop: Stop }) => void;
}

export interface Timings {
  navigationLockMs: number;
  settleMs: number;
  wheelThreshold: number;
  wheelResetMs: number;
  touchThreshold: number;
  touchIntentThreshold: number;
  touchMomentumSettleMs: number;
  alignmentFrames: number;
  touchActivityStaleMs: number;
  verticalIntentRatio: number;
  zoomThreshold: number;
}
export const DEFAULT_TIMINGS: Readonly<Timings>;
export const version: string;

export type ReadTop = (stop: Stop) => number | null;
export type MeasuredStop = Stop & { readonly top: number };
export interface StopIndex {
  setStops(stops: Stop[]): IndexState;
  getStops(): Stop[];
  getById(id: string): Stop | null;
  getOrderedStops(readTop: ReadTop): MeasuredStop[];
  getOrderedStops(): Stop[];
  findDirectional(direction: -1 | 1, currentTop: number, preferredId: string, readTop: ReadTop): MeasuredStop | null;
  findNearest(currentTop: number, readTop: ReadTop): { stop: MeasuredStop; distance: number } | null;
  activate(id: string): Stop | null;
  getState(): IndexState;
}
export function createStopIndex(options?: { initialId?: string; initialContentId?: string }): StopIndex;

export interface NavigationOptions {
  source?: string;
  behavior?: ScrollBehavior;
  settleMs?: number;
  fromId?: string;
  /** Host callback metadata only; the library never changes URL/history. */
  updateHistory?: boolean;
}
export type CancelReason = 'superseded' | 'destroyed' | 'stop-removed' | 'stop-unavailable' | 'alignment-failed';
export type ScrollEvent = Readonly<
  | { type: 'activechange'; source: string; stop: Stop | null; state: ScrollState }
  | { type: 'navigationstart' | 'navigationend'; id: string; source: string; stop: Stop; state: ScrollState }
  | { type: 'navigationcancel'; id: string; source: string; reason: CancelReason; state: ScrollState }
  | { type: 'lockchange' | 'destroy'; state: ScrollState }
>;
export interface WheelGesture {
  deltaX: number;
  deltaY: number;
  horizontalDominant: boolean;
  shiftKey: boolean;
}
export interface TouchGesture {
  deltaX: number;
  deltaY: number;
  absDeltaX: number;
  absDeltaY: number;
  horizontalDominant: boolean;
  verticalIntent: boolean;
}
export interface ScrollOptions {
  initialId?: string;
  getStops: () => Stop[];
  window?: Window;
  document?: Document;
  /** CSS class host only, not a scroll container. Defaults to documentElement. */
  rootElement?: HTMLElement;
  /** Input listener host only, not a scroll container. Defaults to window. */
  eventTarget?: EventTarget;
  reduceMotion?: Pick<MediaQueryList, 'matches'>;
  timings?: Partial<Timings>;
  observerThresholds?: number[];
  managedClass?: string;
  visibleClass?: string;
  monitorRestAlignment?: boolean;
  shouldYieldWheel?: (event: WheelEvent, gesture: WheelGesture) => boolean;
  shouldYieldTouch?: (event: TouchEvent, gesture: TouchGesture) => boolean;
  onActiveChange?: (event: IndexState & { source: string; stop: Stop }) => void;
  onNavigate?: (event: { stop: Stop; options: NavigationOptions; state: ScrollState }) => void;
  onVisibilityChange?: (event: { entry: IntersectionObserverEntry; stop: Stop | null; visible: boolean }) => void;
}
export interface ScrollController {
  subscribe(listener: (event: ScrollEvent) => void): () => void;
  getStop(id: string): Stop | null;
  getStops(): Stop[];
  mount(): ScrollState;
  refresh(): ScrollState;
  destroy(): void;
  goTo(stop: string | Stop, options?: NavigationOptions): boolean;
  move(direction: -1 | 1, options?: NavigationOptions): boolean;
  /** Changes selection only; does not scroll or confirm arrival. */
  setActive(stop: string | Stop, source?: string, force?: boolean): Stop | null;
  readStopTop(stop: Stop | null): number | null;
  getState(): ScrollState;
}
export function createScrollController(options: ScrollOptions): ScrollController;

export interface SegmentViewOptions {
  track?: HTMLElement | null;
  controls?: ArrayLike<HTMLElement>;
  getControls?: () => ArrayLike<HTMLElement>;
  getTargetId?: (control: HTMLElement) => string;
  activeClass?: string;
  ariaAttribute?: string;
  xProperty?: string;
  widthProperty?: string;
  window?: Window;
  revealControl?: (control: HTMLElement, context: { targetId: string }) => void;
  measureIndicator?: (control: HTMLElement, track: HTMLElement) => { x: number; width: number } | null;
}
export interface SegmentView {
  connect(controller: Pick<ScrollController, 'getState' | 'subscribe'>): () => void;
  render(id?: string): HTMLElement | null;
  updateIndicator(control?: HTMLElement): void;
  destroy(): void;
}
export function createSegmentView(options?: SegmentViewOptions): SegmentView;

export interface ViewportOptions {
  window?: Window;
  rootElement?: HTMLElement;
  widthProperty?: string;
  heightProperty?: string;
  onChange?: (size: { width: number; height: number }) => void;
}
export interface ViewportSync {
  mount(): { width: number; height: number } | null;
  sync(): { width: number; height: number } | null;
  destroy(): void;
}
export function createViewportCssSync(options?: ViewportOptions): ViewportSync;

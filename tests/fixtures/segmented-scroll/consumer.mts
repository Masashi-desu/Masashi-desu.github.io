import { createScrollController, createSegmentView, createStopIndex, createViewportCssSync, DEFAULT_TIMINGS, type Stop } from '@masahi-desu/segmented-scroll';
const stops: Stop[] = [{ id: 'intro', element: document.body }, { id: 'footer', role: 'auxiliary', align: 'document-end', contentAnchor: 'previous' }];
const navigation = createScrollController({ getStops: () => stops, timings: { wheelThreshold: DEFAULT_TIMINGS.wheelThreshold } });
const unsubscribe = navigation.subscribe(event => {
  if (event.type === 'navigationcancel') console.log(event.reason);
  if (event.type === 'navigationend') console.log(event.state.settledId, event.stop.id);
  // @ts-expect-error event snapshots are read only
  event.state.activeId = 'other';
});
const view = createSegmentView({ controls: document.querySelectorAll('button'), getTargetId: element => element.dataset.target ?? '' });
view.connect(navigation);
navigation.mount();
navigation.goTo('footer', { source: 'button' });
// @ts-expect-error the controller does not expose a mutable index
navigation.index.activate('intro');
const index = createStopIndex();
index.setStops(stops);
index.findDirectional(1, 0, '', stop => stop.id === 'intro' ? 0 : 100);
createViewportCssSync({ heightProperty: '--height' }).destroy();
unsubscribe();
view.destroy();
navigation.destroy();

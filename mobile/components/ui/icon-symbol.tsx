// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SFSymbol, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

// Keyed on SFSymbol, not SymbolViewProps['name']: SDK 57 widened the latter to
// `SFSymbol | { ios?, android?, web? }`, and an object can't be a Record key.
type IconMapping = Record<SFSymbol, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mappings.
 *
 * This is the app's whole icon vocabulary — every glyph in the UI comes from
 * here, so the set stays consistent instead of drifting into emoji. A name must
 * exist in this map to be usable: TypeScript resolves `@/components/ui/icon-symbol`
 * to this file, so `name` is typed as `keyof typeof MAPPING`.
 *
 * - SF Symbols catalogue: the SF Symbols app from Apple
 * - Material names: https://icons.expo.fyi
 */
const MAPPING = {
  // Navigation & chrome
  'house.fill': 'home',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'chevron.left.forwardslash.chevron.right': 'code',
  'arrow.right': 'arrow-forward',
  'xmark': 'close',
  'checkmark': 'check',
  'magnifyingglass': 'search',
  'pencil': 'edit',
  'paperplane.fill': 'send',

  // Tab bar
  'gamecontroller.fill': 'videogame-asset',
  'trophy.fill': 'emoji-events',
  'music.mic': 'mic',
  'chart.bar.fill': 'bar-chart',
  'person.fill': 'person',

  // Music & playback
  'music.note': 'music-note',
  'music.note.list': 'queue-music',
  'opticaldisc.fill': 'album',
  'headphones': 'headphones',
  'dot.radiowaves.left.and.right': 'podcasts',
  'clock.arrow.circlepath': 'history',
  'play.fill': 'play-arrow',

  // Stats & badges
  'flame.fill': 'local-fire-department',
  'sparkles': 'auto-awesome',
  'lock.fill': 'lock',
  'clock.fill': 'schedule',
  'map.fill': 'explore',
  'moon.fill': 'nightlight-round',
  'star.fill': 'star',

  // Social
  'heart.fill': 'favorite',
  'heart': 'favorite-border',
  'person.2.fill': 'group',

  // Profile editing
  'camera.fill': 'photo-camera',
  'lightbulb.fill': 'lightbulb',
  'rectangle.portrait.and.arrow.right': 'logout',
  'globe': 'public',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

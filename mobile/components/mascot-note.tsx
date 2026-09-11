import { Text, View } from "react-native";

import { Mascot } from "@/components/mascot";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

/**
 * An empty state with Freak in it, for the Stats period pager.
 *
 * A period with nothing in it is not an error, and a spinner or a grey "no
 * data" line makes it feel like one. Freak turning up to say the day was quiet
 * reads as the app noticing, not failing.
 *
 * He keeps his pull-to-refresh pose — both fists gripping an edge, fingers
 * running off the bottom of his viewBox — so he needs an edge to hang from.
 * That's what the card is: it starts exactly where his artwork ends, so the
 * cropped fingers land on its top border and read as wrapped over it. Don't put
 * a gap between them, or he's left floating with his hands cut off.
 */
export function MascotNote({
  title,
  body,
  variant = "quiet",
}: {
  title: string;
  body: string;
  /** "quiet" = nothing played; "locked" = period not reached yet. */
  variant?: "quiet" | "locked";
}) {
  const locked = variant === "locked";
  return (
    <View style={{ alignItems: "center" }}>
      <Mascot size={104} mood={locked ? "deadpan" : "sad"} lock={locked} />
      <View
        style={{
          ...cardSurface,
          width: "100%",
          alignItems: "center",
          gap: 7,
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 22,
        }}>
        <Text style={{ ...typography.section, color: colors.foreground, textAlign: "center" }}>
          {title}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
          }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

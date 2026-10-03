/**
 * Style guide (SPEC-005 D1), dev/internal at /styleguide, outside the main
 * navigation. Renders every design-token group in the active theme (switch the
 * theme with the toggle at the top), a glass sample over busy content, a
 * reading sample and the canonical component catalogue (SPEC-005 D2).
 */

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/Segmented";
import { useT } from "@/lib/i18n";
import { useThemeStore } from "@/stores/theme";
import { ComponentShowcase } from "./ComponentShowcase";
import "./styleguide.css";

const SURFACES = ["page", "panel", "subtle", "muted", "reader"] as const;
const COLOURS = [
  ["accent", "var(--accent)"],
  ["accent-subtle", "var(--accent-subtle)"],
  ["hover-overlay", "var(--hover-overlay)"],
  ["selected-overlay", "var(--selected-overlay)"],
  ["text-main", "var(--text-main)"],
  ["text-label", "var(--text-label)"],
  ["text-muted", "var(--text-muted)"],
  ["border", "var(--border)"],
  ["border-strong", "var(--border-strong)"],
  ["status-unknown", "var(--status-unknown)"],
  ["status-learning", "var(--status-learning)"],
  ["status-known", "var(--status-known)"],
  ["danger", "var(--danger)"]
] as const;
const RADII = ["control-sm", "control", "container", "pill"] as const;
const TEXT_STYLES = ["title", "heading", "body", "caption"] as const;
const WEIGHTS = [
  ["400", "font-normal"],
  ["500", "font-medium"],
  ["600", "font-semibold"]
] as const;

/** The /styleguide page. */
export default function StyleguidePage() {
  const t = useT();
  const resolvedTheme = useThemeStore((state) => state.resolved);
  const setTheme = useThemeStore((state) => state.setTheme);
  return (
    <div className="styleguide mx-auto grid max-w-5xl gap-10 p-6 mobile:p-3" data-testid="styleguide">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t("styleguide.title")}</h1>
        <Segmented
          aria-label={t("settings.theme")}
          size="sm"
          className="w-48"
          value={resolvedTheme}
          onValueChange={setTheme}
          options={[
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") }
          ]}
        />
      </div>

      <section className="grid gap-3" id="styleguide-palette">
        <h2 className="text-heading">{t("styleguide.palette")}</h2>
        <div className="styleguide-swatches">
          {COLOURS.map(([name, value]) => (
            <div key={name} className="grid gap-1.5">
              <span className="styleguide-swatch" style={{ "--swatch": value } as React.CSSProperties} />
              <span className="text-caption text-secondary">--{name}</span>
            </div>
          ))}
          <div className="grid gap-1.5">
            <span className="styleguide-swatch grid place-items-center text-body" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
              Aa
            </span>
            <span className="text-caption text-secondary">--accent-foreground</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-surfaces">
        <h2 className="text-heading">{t("styleguide.surfaces")}</h2>
        <div className="styleguide-swatches">
          {SURFACES.map((name) => (
            <div key={name} className="grid gap-1.5">
              <span className="styleguide-swatch border border-line" style={{ background: `var(--surface-${name})` }} />
              <span className="text-caption text-secondary">--surface-{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-radii">
        <h2 className="text-heading">{t("styleguide.radii")}</h2>
        <div className="flex flex-wrap gap-4">
          {RADII.map((name) => (
            <div key={name} className="grid gap-1.5">
              <span className="block h-14 w-24 border border-line-strong" style={{ borderRadius: `var(--radius-${name})` }} />
              <span className="text-caption text-secondary">--radius-{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-type">
        <h2 className="text-heading">{t("styleguide.type")}</h2>
        <div className="grid gap-2">
          {TEXT_STYLES.map((name) => (
            <p key={name} className={`text-${name}`}>
              text-{name}: Supergloss 読んで学ぶ 阅读学习
            </p>
          ))}
          <div className="flex flex-wrap gap-4 text-body">
            {WEIGHTS.map(([weight, className]) => (
              <span key={weight} className={className}>
                {weight}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-elevation">
        <h2 className="text-heading">{t("styleguide.elevation")}</h2>
        <div className="flex flex-wrap gap-4">
          <div className="grid h-20 w-40 place-items-center rounded-container bg-panel text-caption shadow-float">--shadow-float</div>
          <Button variant="primary">--focus-ring</Button>
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-glass">
        <h2 className="text-heading">{t("styleguide.glass")}</h2>
        <div className="styleguide-busy relative grid min-h-48 place-items-center overflow-hidden rounded-container">
          <div className="glass grid gap-1 rounded-container p-4 text-center shadow-float">
            <span className="text-heading">--glass-bg</span>
            <span className="text-caption text-secondary">--glass-border --glass-blur</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3" id="styleguide-reading">
        <h2 className="text-heading">{t("styleguide.reading")}</h2>
        <article className="styleguide-reading text-[1.125em] rounded-container bg-reader p-6 mobile:p-4">
          <p lang="en">The quick brown fox jumps over the lazy dog. Reading should feel calm, even and typographic.</p>
          <p lang="ja">吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。</p>
          <p lang="zh">天下大势，分久必合，合久必分。读书使人明智，写作使人精确。</p>
        </article>
      </section>

      <section className="grid gap-4" id="styleguide-components">
        <h2 className="text-heading">{t("styleguide.components")}</h2>
        <ComponentShowcase />
      </section>
    </div>
  );
}

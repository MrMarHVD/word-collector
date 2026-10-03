/**
 * Style guide component catalogue (SPEC-005 D2): renders every canonical component and variant,
 * including default, focus (forced) and disabled states. Hover and focus are also live.
 */
import { useState, type ReactNode } from "react";
import { PencilIcon, PlusIcon, SettingsIcon, Trash2Icon, XIcon } from "lucide-react";
import { CloseButton } from "@/components/app/CloseButton";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { DisambiguationTable } from "@/components/app/Disambiguation";
import { Flag } from "@/components/app/Flag";
import { ListRow } from "@/components/app/ListRow";
import { Segmented } from "@/components/app/Segmented";
import { PageHeader } from "@/components/app/PageHeader";
import { SettingRow, SettingSection, SettingSelect } from "@/components/app/SettingRow";
import { toast } from "@/components/app/toast";
import { TranslationOverride } from "@/components/app/TranslationOverride";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["sm", "md", "lg"] as const;
const ICON_VARIANTS = ["ghost", "secondary", "destructive"] as const;
const EXTRA_BUTTON_SIZES = ["xs", "icon-xs", "icon-sm", "icon", "icon-lg"] as const;
const SHEET_SIDES = ["left", "right", "top", "bottom"] as const;
const FLAG_LANGUAGES = ["Japanese", "English", "Chinese"] as const;
const SAMPLE_WORD = {
  surface: "猫",
  translation: "cat",
  canonicalTranslation: "cat",
  disambiguationCandidates: [
    { source: "猫", translation: "cat", pos: "noun" },
    { source: "猫", translation: "feline", pos: "noun" },
    { source: "猫", translation: "to purr", pos: "verb" },
    { source: "猫", translation: "kitty", pos: "noun" },
    { source: "猫", translation: "tomcat", pos: "noun" },
    { source: "猫", translation: "pet", pos: "noun" }
  ]
};
const SAMPLE_OVERRIDDEN_WORD = { ...SAMPLE_WORD, translation: "kitten", translationOverride: "kitten" };
const BADGE_VARIANTS = ["neutral", "accent", "destructive", "outline", "unknown", "learning", "known"] as const;

/** A titled block of the catalogue. */
function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3" id={id}>
      <h3 className="text-heading">{title}</h3>
      {children}
    </section>
  );
}

/** Row label in the variant grids. */
function Tag({ children }: { children: ReactNode }) {
  return <span className="w-24 shrink-0 text-caption text-secondary">{children}</span>;
}

/** The component catalogue section of /styleguide. */
export function ComponentShowcase() {
  const t = useT();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<"plain" | "overridden" | null>(null);
  const [overrides, setOverrides] = useState<{ plain: string; overridden: string }>({ plain: "", overridden: "kitten" });
  const [tab, setTab] = useState("one");
  const [segment, setSegment] = useState("a");
  const [segmentSmall, setSegmentSmall] = useState("a");
  const [volume, setVolume] = useState([40]);
  const options = [
    { value: "a", label: t("styleguide.sampleOptionA") },
    { value: "b", label: t("styleguide.sampleOptionB") }
  ];
  const states: Array<[string, string, boolean]> = [
    ["default", "", false],
    ["focus", "sg-focus", false],
    ["disabled", "", true]
  ];

  return (
    <div className="grid gap-8" data-testid="styleguide-components">
      <Text variant="caption" tone="label">
        {t("styleguide.hoverFocusNote")}
      </Text>

      <Block id="styleguide-buttons" title={t("styleguide.buttons")}>
        <div className="grid gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <Tag>{variant}</Tag>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
              <Button variant={variant}>
                <PlusIcon />
                {t("styleguide.sampleLabel")}
              </Button>
              <Button variant={variant} className="sg-focus">
                focus
              </Button>
              <Button variant={variant} disabled>
                disabled
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Tag>sizes</Tag>
            {EXTRA_BUTTON_SIZES.map((size) => (
              <Button key={size} variant="secondary" size={size} aria-label={size}>
                {size.startsWith("icon") ? <PlusIcon /> : size}
              </Button>
            ))}
          </div>
        </div>
      </Block>

      <Block id="styleguide-icon-buttons" title={t("styleguide.iconButtons")}>
        <div className="grid gap-3">
          {ICON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <Tag>{variant}</Tag>
              <IconButton variant={variant} size="sm" aria-label={t("common.edit")}>
                <PencilIcon />
              </IconButton>
              <IconButton variant={variant} size="md" aria-label={t("common.delete")}>
                <Trash2Icon />
              </IconButton>
              <IconButton variant={variant} size="md" className="sg-focus" aria-label={t("common.close")}>
                <XIcon />
              </IconButton>
              <IconButton variant={variant} size="md" disabled aria-label={t("common.close")}>
                <XIcon />
              </IconButton>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Tag>CloseButton</Tag>
            <CloseButton label={t("common.close")} />
            <CloseButton label={t("styleguide.closeButton")} className="sg-focus" />
            <CloseButton label={t("styleguide.closeButton")} disabled />
          </div>
        </div>
      </Block>

      <Block id="styleguide-cards" title={t("styleguide.cards")}>
        <div className="grid gap-4 desktop:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("styleguide.sampleTitle")}</CardTitle>
              <CardDescription>{t("styleguide.sampleText")}</CardDescription>
              <CardAction>
                <IconButton size="sm" aria-label={t("common.edit")}>
                  <PencilIcon />
                </IconButton>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Text variant="body">{t("styleguide.sampleText")}</Text>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="secondary">{t("common.cancel")}</Button>
              <Button>{t("common.save")}</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardContent>
              <Text variant="body">{t("styleguide.sampleText")}</Text>
            </CardContent>
          </Card>
        </div>
      </Block>

      <Block id="styleguide-fields" title={t("styleguide.fields")}>
        <div className="grid gap-4 desktop:grid-cols-2">
          {states.map(([name, className, disabled]) => (
            <Input key={name} className={className} disabled={disabled} placeholder={name} aria-label={name} />
          ))}
          <Input aria-invalid defaultValue="invalid" aria-label="invalid" />
          <Input type="search" variant="search" placeholder="search" aria-label="search" />
          <Textarea placeholder="textarea" aria-label="textarea" />
          <Select defaultValue="a">
            <SelectTrigger aria-label="select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select defaultValue="a">
            <SelectTrigger aria-label="select small" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NativeSelect aria-label="native select" defaultValue="a">
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === "a" ? t("styleguide.sampleOptionA") : t("styleguide.sampleOptionB")}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="native select disabled" disabled>
            <option>{t("styleguide.sampleOptionA")}</option>
          </NativeSelect>
        </div>
      </Block>

      <Block id="styleguide-navigation" title={t("styleguide.navigation")}>
        <div className="grid gap-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="tabs">
              <TabsTrigger value="one">{t("styleguide.sampleOptionA")}</TabsTrigger>
              <TabsTrigger value="two">{t("styleguide.sampleOptionB")}</TabsTrigger>
              <TabsTrigger value="three" disabled>
                disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="pt-3 text-body">
              {t("styleguide.sampleText")}
            </TabsContent>
            <TabsContent value="two" className="pt-3 text-body">
              {t("styleguide.sampleMeta")}
            </TabsContent>
          </Tabs>
          <Tabs value={tab} onValueChange={setTab} className="mt-3">
            <TabsList variant="bar" aria-label="tabs bar">
              <TabsTrigger value="one">{t("styleguide.sampleOptionA")}</TabsTrigger>
              <TabsTrigger value="two">{t("styleguide.sampleOptionB")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="one" orientation="vertical">
            <TabsList aria-label="tabs vertical">
              <TabsTrigger value="one">{t("styleguide.sampleOptionA")}</TabsTrigger>
              <TabsTrigger value="two">{t("styleguide.sampleOptionB")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Segmented aria-label="segmented" value={segment} onValueChange={setSegment} options={options} className="max-w-sm" />
          <Segmented aria-label="segmented small" size="sm" value={segmentSmall} onValueChange={setSegmentSmall} options={options} className="max-w-sm" />
        </div>
      </Block>

      <Block id="styleguide-controls" title={t("styleguide.controls")}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Switch aria-label="switch off" />
            <Switch aria-label="switch on" defaultChecked />
            <Switch aria-label="switch small" size="sm" defaultChecked />
            <Switch aria-label="switch focus" className="sg-focus" />
            <Switch aria-label="switch disabled" disabled />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox aria-label="checkbox off" />
            <Checkbox aria-label="checkbox on" defaultChecked />
            <Checkbox aria-label="checkbox focus" className="sg-focus" />
            <Checkbox aria-label="checkbox disabled" disabled />
            <Checkbox aria-label="checkbox invalid" aria-invalid />
          </div>
          <div className="grid max-w-sm gap-3">
            <Slider aria-label="slider" value={volume} onValueChange={setVolume} />
            <Slider aria-label="slider disabled" defaultValue={[60]} disabled />
          </div>
          <div className="grid max-w-sm gap-3">
            <Progress aria-label="progress md" value={60} />
            <Progress aria-label="progress sm" size="sm" value={35} />
            <Progress aria-label="progress indeterminate" indeterminate />
          </div>
        </div>
      </Block>

      <Block id="styleguide-lists" title={t("styleguide.lists")}>
        <Card className="gap-0 overflow-hidden py-0">
          <ListRow title={t("styleguide.sampleTitle")} />
          <ListRow
            leading={<Checkbox aria-label={t("styleguide.sampleLabel")} />}
            title={t("styleguide.sampleTitle")}
            meta={t("styleguide.sampleMeta")}
            trailing={<Badge variant="learning">{t("styleguide.learning")}</Badge>}
            actions={
              <IconButton size="sm" aria-label={t("common.edit")}>
                <PencilIcon />
              </IconButton>
            }
          />
          <ListRow selected title={t("styleguide.sampleTitle")} meta={t("styleguide.sampleMeta")} trailing={t("styleguide.sampleValue")} />
          <ListRow
            title={t("styleguide.sampleTitle")}
            meta={t("styleguide.sampleMeta")}
            below={<Input aria-label={t("styleguide.sampleLabel")} className="max-w-xs" />}
          />
        </Card>
      </Block>

      <Block id="styleguide-flags" title={t("styleguide.flags")}>
        <div className="flex flex-wrap items-center gap-3">
          {FLAG_LANGUAGES.map((language) => (
            <span key={language} className="inline-flex items-center gap-2 text-caption text-secondary">
              <span className="inline-block h-5 w-7">
                <Flag language={language} />
              </span>
              {language}
            </span>
          ))}
        </div>
      </Block>

      <Block id="styleguide-badges" title={t("styleguide.badges")}>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-body">
          <span className="text-status-unknown-text">text-status-unknown-text</span>
          <span className="text-status-learning-text">text-status-learning-text</span>
          <span className="text-status-known-text">text-status-known-text</span>
        </div>
      </Block>

      <Block id="styleguide-tables" title={t("styleguide.tables")}>
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("styleguide.sampleLabel")}</TableHead>
                <TableHead>{t("styleguide.sampleMeta")}</TableHead>
                <TableHead>{t("styleguide.sampleValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["unknown", t("styleguide.unknown")],
                ["learning", t("styleguide.learning")],
                ["known", t("styleguide.known")]
              ].map(([variant, label]) => (
                <TableRow key={variant}>
                  <TableCell>{t("styleguide.sampleTitle")}</TableCell>
                  <TableCell className="text-secondary">{t("styleguide.sampleMeta")}</TableCell>
                  <TableCell>
                    <Badge variant={variant as "unknown" | "learning" | "known"}>{label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t("styleguide.tableFooter")}</TableCell>
                <TableCell />
                <TableCell>3</TableCell>
              </TableRow>
            </TableFooter>
            <TableCaption>{t("styleguide.tableCaption")}</TableCaption>
          </Table>
        </Card>
      </Block>

      <Block id="styleguide-disambiguation" title={t("styleguide.disambiguation")}>
        <div className="grid gap-4 desktop:grid-cols-2">
          <Card className="overflow-hidden py-0">
            <DisambiguationTable entry={SAMPLE_OVERRIDDEN_WORD} />
          </Card>
          <div className="grid gap-1.5">
            <Text variant="caption" tone="label">
              {t("styleguide.stickyHeader")}
            </Text>
            <Card className="max-h-40 overflow-auto py-0">
              <DisambiguationTable entry={SAMPLE_WORD} stickyHeader />
            </Card>
          </div>
        </div>
      </Block>

      <Block id="styleguide-translation-override" title={t("styleguide.translationOverride")}>
        <div className="grid max-w-md gap-3">
          {(["plain", "overridden"] as const).map((key) => {
            const base = key === "plain" ? SAMPLE_WORD : SAMPLE_OVERRIDDEN_WORD;
            const override = overrides[key];
            return (
              <TranslationOverride
                key={key}
                entry={{ ...base, translation: override || base.canonicalTranslation, translationOverride: override }}
                wordId={key === "plain" ? 1 : 2}
                context="vocab"
                editing={editing === key}
                onEdit={() => setEditing(key)}
                onCancel={() => setEditing(null)}
                onSave={(value) => {
                  setOverrides((current) => ({ ...current, [key]: value.trim() }));
                  setEditing(null);
                }}
                onClear={() => setOverrides((current) => ({ ...current, [key]: "" }))}
              />
            );
          })}
          <TranslationOverride
            entry={SAMPLE_OVERRIDDEN_WORD}
            wordId={3}
            context="reader"
            compact
            editing={false}
            onEdit={() => undefined}
            onCancel={() => undefined}
            onSave={() => undefined}
            onClear={() => undefined}
          />
        </div>
      </Block>

      <Block id="styleguide-settings" title={t("styleguide.settingsRows")}>
        <div className="grid max-w-xl gap-4">
          <SettingSection title={t("styleguide.sampleSetting")}>
            <SettingRow label={t("styleguide.sampleSetting")} description={t("styleguide.sampleSettingHint")}>
              <Switch aria-label={t("styleguide.sampleSetting")} defaultChecked />
            </SettingRow>
            <SettingRow label={t("styleguide.sampleSetting")} description={t("styleguide.sampleSettingHint")} stacked>
              <Select defaultValue="a">
                <SettingSelect aria-label={t("styleguide.sampleSetting")}>
                  <SelectValue />
                </SettingSelect>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label={t("styleguide.sampleSetting")} stacked>
              <Slider aria-label={t("styleguide.sampleSetting")} defaultValue={[50]} />
            </SettingRow>
          </SettingSection>
          <FloatingPanel open className="static w-full">
            <SettingSection variant="inset" title={t("styleguide.sampleSetting")}>
              <SettingRow label={t("styleguide.sampleSetting")} description={t("styleguide.sampleSettingHint")}>
                <Switch aria-label={t("styleguide.sampleSetting")} defaultChecked />
              </SettingRow>
              <SettingRow label={t("styleguide.sampleSetting")}>
                <Switch aria-label={t("styleguide.sampleSetting")} />
              </SettingRow>
            </SettingSection>
          </FloatingPanel>
        </div>
      </Block>

      <Block id="styleguide-text" title={t("styleguide.textStyles")}>
        <div className="grid gap-1">
          <Text variant="title">title: {t("styleguide.sampleTitle")}</Text>
          <PageHeader title={`PageHeader: ${t("styleguide.sampleTitle")}`} className="mb-0" />
          <PageHeader
            title={`${t("styleguide.pageHeader")}: ${t("styleguide.sampleTitle")}`}
            className="mb-0"
            actions={
              <Segmented aria-label="page header actions" size="sm" className="w-40" value={segmentSmall} onValueChange={setSegmentSmall} options={options} />
            }
          />
          <Text variant="heading" as="h4">
            heading: {t("styleguide.sampleTitle")}
          </Text>
          <Text variant="body">body: {t("styleguide.sampleText")}</Text>
          <Text variant="caption" as="p" tone="label">
            caption (label): {t("styleguide.sampleMeta")}
          </Text>
          <Text variant="caption" as="p" tone="muted">
            caption (muted): {t("styleguide.sampleMeta")}
          </Text>
        </div>
      </Block>

      <Block id="styleguide-floating" title={t("styleguide.floating")}>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t("styleguide.openDialog")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("styleguide.sampleTitle")}</DialogTitle>
                <DialogDescription>{t("styleguide.dialogText")}</DialogDescription>
              </DialogHeader>
              <Input aria-label={t("styleguide.sampleLabel")} placeholder={t("styleguide.sampleLabel")} />
              <DialogFooter>
                <Button>{t("common.save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary">{t("styleguide.openAlert")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("styleguide.sampleTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("styleguide.dialogText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive">{t("common.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{t("styleguide.openSheet")}</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("styleguide.sampleTitle")}</SheetTitle>
                <SheetDescription>{t("styleguide.dialogText")}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">{t("styleguide.openPopover")}</Button>
            </PopoverTrigger>
            <PopoverContent>
              <Text variant="body">{t("styleguide.dialogText")}</Text>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">{t("styleguide.openMenu")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t("styleguide.sampleLabel")}</DropdownMenuLabel>
              <DropdownMenuItem>
                <SettingsIcon />
                {t("styleguide.sampleOptionA")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2Icon />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="secondary"
            onClick={async () =>
              toast.info(
                (await confirm({
                  title: t("styleguide.confirmTitle"),
                  description: t("styleguide.confirmText"),
                  destructive: true,
                  confirmLabel: t("common.delete")
                }))
                  ? t("styleguide.confirmed")
                  : t("styleguide.cancelled")
              )
            }
          >
            {t("styleguide.openConfirm")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary">{t("styleguide.tooltipTrigger")}</Button>
            </TooltipTrigger>
            <TooltipContent>{t("styleguide.tooltipText")}</TooltipContent>
          </Tooltip>
          {SHEET_SIDES.map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="secondary">
                  {t("styleguide.openSheet")}: {side}
                </Button>
              </SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>{t("styleguide.sampleTitle")}</SheetTitle>
                  <SheetDescription>{t("styleguide.dialogText")}</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          ))}
          <FloatingPanel open className="static w-72">
            <Text variant="body">{t("styleguide.dialogText")}</Text>
          </FloatingPanel>
          <Button variant="secondary" onClick={() => toast.success(t("styleguide.toastText"))}>
            {t("styleguide.showToast")}
          </Button>
          <Button variant="secondary" onClick={() => toast.error(t("styleguide.toastText"))}>
            {t("styleguide.showToastError")}
          </Button>
          <Button variant="secondary" onClick={() => toast.info(t("styleguide.toastText"))}>
            {t("styleguide.showToastInfo")}
          </Button>
        </div>
      </Block>
    </div>
  );
}

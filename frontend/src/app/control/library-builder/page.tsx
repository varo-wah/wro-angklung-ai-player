"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";

import {
  DEFAULT_DRAFT_STATUS,
  LIBRARY_BUILDER_ALLOWED_EXTENSIONS,
  LIBRARY_BUILDER_DEFERRED_EXTENSIONS,
  LIBRARY_BUILDER_MAX_FILE_BYTES,
  convertMidiToLibraryDraft,
  getFileExtension,
  parseMidiArrayBuffer,
  slugifySongId,
  type LibraryBuilderMetadata,
  type LibraryBuilderResult,
  type LibraryBuilderSettings,
  type ParsedMidiSource,
} from "@/lib/libraryBuilder";

const inputClass =
  "mt-1.5 w-full rounded-md border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-lime-300/60 focus:ring-2 focus:ring-lime-300/10";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400";

const INITIAL_METADATA: LibraryBuilderMetadata = {
  title: "",
  artist: "",
  songId: "",
  category: "pop",
  difficulty: "medium",
  priority: "medium",
  aliases: [],
  moods: [],
  tags: [],
  requestKeywords: [],
};

const INITIAL_SETTINGS: LibraryBuilderSettings = {
  transpositionMode: "auto",
  manualTransposition: 0,
  melodySource: "auto",
  melodyTrackIndex: null,
  accompanimentSource: "auto",
  accompanimentTrackIndex: null,
  accompanimentDensity: "normal",
  draftStatus: DEFAULT_DRAFT_STATUS,
};

export default function LibraryBuilderPage() {
  const [source, setSource] = useState<ParsedMidiSource | null>(null);
  const [metadata, setMetadata] = useState<LibraryBuilderMetadata>(INITIAL_METADATA);
  const [settings, setSettings] = useState<LibraryBuilderSettings>(INITIAL_SETTINGS);
  const [result, setResult] = useState<LibraryBuilderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);

  const populatedTracks = source?.tracks.filter((track) => track.noteCount > 0) ?? [];
  const outputJson = useMemo(
    () => ({
      arrangement: result ? JSON.stringify(result.arrangement, null, 2) : "",
      catalog: result ? JSON.stringify(result.catalogEntry, null, 2) : "",
      report: result ? JSON.stringify(result.conversionReport, null, 2) : "",
    }),
    [result],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setResult(null);
    setSource(null);
    const extension = getFileExtension(file.name);

    if ((LIBRARY_BUILDER_DEFERRED_EXTENSIONS as readonly string[]).includes(extension)) {
      setError(
        extension === "mxl"
          ? "MXL support is coming later. V1 accepts standard MIDI files only."
          : "MusicXML parsing is a documented v1 TODO. Export the score as .mid or .midi and upload that file instead.",
      );
      return;
    }
    if (!(LIBRARY_BUILDER_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      setError("Unsupported file type. Upload a .mid or .midi file. MusicXML/MXL are not parsed in v1.");
      return;
    }
    if (file.size > LIBRARY_BUILDER_MAX_FILE_BYTES) {
      setError("File is larger than the 5 MB local upload limit.");
      return;
    }

    setIsReading(true);
    try {
      const parsed = parseMidiArrayBuffer(await file.arrayBuffer(), file.name);
      setSource(parsed);
      const defaultTrackIndex = parsed.tracks.find((track) => track.noteCount > 0)?.index ?? null;
      setSettings((current) => ({
        ...current,
        melodyTrackIndex: defaultTrackIndex,
        accompanimentTrackIndex: defaultTrackIndex,
      }));
      setMetadata((current) => {
        const nextTitle = current.title || parsed.midiName;
        return {
          ...current,
          title: nextTitle,
          songId: current.songId || slugifySongId(nextTitle),
        };
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The MIDI file could not be read.");
    } finally {
      setIsReading(false);
      event.target.value = "";
    }
  }

  function updateTitle(title: string) {
    setMetadata((current) => ({
      ...current,
      title,
      songId: idManuallyEdited ? current.songId : slugifySongId(title),
    }));
    setResult(null);
  }

  function updateCsvField(field: "aliases" | "moods" | "tags" | "requestKeywords", value: string) {
    setMetadata((current) => ({ ...current, [field]: splitCsv(value) }));
    setResult(null);
  }

  function handleConvert() {
    if (!source) {
      setError("Upload a MIDI file before converting.");
      return;
    }

    setError(null);
    try {
      setResult(convertMidiToLibraryDraft(source, metadata, settings));
    } catch (caughtError) {
      setResult(null);
      setError(caughtError instanceof Error ? caughtError.message : "Conversion failed.");
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 pb-20 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lime-300">Control / Library Builder</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-50">Angklobot Library Builder</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Inspect a local MIDI file, map it deterministically to the physical G3-C6 rack, validate the draft, and export reviewable library JSON.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label="Parser" value="Local browser" tone="lime" />
            <StatusPill label="AI note generation" value="Disabled" tone="slate" />
            <Link
              className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/30 hover:bg-white/[0.08]"
              href="/control"
            >
              Back to Control Panel
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Source file" value={source?.filename ?? "Not uploaded"} detail={source ? `${source.tempoBpm} BPM · ${source.timeSignature}` : "MIDI up to 5 MB"} />
          <MetricCard label="Tracks" value={source ? String(source.tracks.length) : "—"} detail={source ? `${populatedTracks.length} contain notes` : "Waiting for inspection"} />
          <MetricCard label="Output notes" value={result ? String(result.arrangement.notes.length) : "—"} detail={result ? `${result.conversionReport.transposition_used >= 0 ? "+" : ""}${result.conversionReport.transposition_used} semitones` : "Convert to calculate"} />
          <MetricCard label="Validation" value={result?.validationReport.overall ?? "Not run"} detail={result ? result.conversionReport.verdict.replaceAll("_", " ") : "No validation bypass"} tone={result?.validationReport.overall === "FAILED" ? "red" : result ? "lime" : "slate"} />
        </section>

        <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-100">
          <strong>Simulator draft only.</strong> Not <code className="rounded bg-black/25 px-1.5 py-0.5">demo_safe</code>. Review before real motors. The browser does not write into the repository automatically.
        </div>

        {error ? (
          <div className="rounded-lg border border-red-400/35 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100" role="alert">
            {error}
          </div>
        ) : null}

        <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,0.92fr)_minmax(620px,1.08fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <BuilderSection number="01" title="Upload file" subtitle="Accepted now: .mid and .midi. MusicXML/MXL are explicitly deferred.">
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-lime-300/30 bg-lime-300/[0.04] px-6 py-10 text-center hover:border-lime-300/60 hover:bg-lime-300/[0.07]">
                <span className="rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-lime-200">
                  {isReading ? "Parsing locally…" : "Select score file"}
                </span>
                <span className="mt-3 text-base font-semibold text-slate-100">{source?.filename ?? "Choose a MIDI file from this computer"}</span>
                <span className="mt-1 text-xs text-slate-500">No upload, execution, external API, or AI analysis. Maximum file size: 5 MB.</span>
                <input
                  accept=".mid,.midi,.musicxml,.xml,.mxl,audio/midi,audio/x-midi"
                  className="sr-only"
                  disabled={isReading}
                  onChange={handleFileChange}
                  type="file"
                />
              </label>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <MiniStatus label="MIDI" value="Supported" tone="passed" />
                <MiniStatus label="MusicXML/XML" value="V1 TODO" tone="warning" />
                <MiniStatus label="MXL" value="Coming later" tone="warning" />
              </div>
            </BuilderSection>

            <BuilderSection number="02" title="Song metadata" subtitle="This metadata populates both exported JSON objects.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Song title">
                  <input className={inputClass} onChange={(event) => updateTitle(event.target.value)} placeholder="Song Title" value={metadata.title} />
                </Field>
                <Field label="Artist">
                  <input className={inputClass} onChange={(event) => { setMetadata({ ...metadata, artist: event.target.value }); setResult(null); }} placeholder="Artist or composer" value={metadata.artist} />
                </Field>
                <Field label="Song ID" hint="Lowercase snake_case; editable">
                  <input
                    className={inputClass}
                    onChange={(event) => {
                      setIdManuallyEdited(true);
                      setMetadata({ ...metadata, songId: event.target.value.toLowerCase() });
                      setResult(null);
                    }}
                    placeholder="song_id"
                    value={metadata.songId}
                  />
                </Field>
                <Field label="Category">
                  <input className={inputClass} onChange={(event) => { setMetadata({ ...metadata, category: event.target.value }); setResult(null); }} value={metadata.category} />
                </Field>
                <Field label="Difficulty">
                  <select className={inputClass} onChange={(event) => { setMetadata({ ...metadata, difficulty: event.target.value }); setResult(null); }} value={metadata.difficulty}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </Field>
                <Field label="Priority">
                  <select className={inputClass} onChange={(event) => { setMetadata({ ...metadata, priority: event.target.value }); setResult(null); }} value={metadata.priority}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <CsvField label="Aliases" onChange={(value) => updateCsvField("aliases", value)} value={metadata.aliases} />
                <CsvField label="Moods" onChange={(value) => updateCsvField("moods", value)} value={metadata.moods} />
                <CsvField label="Tags" onChange={(value) => updateCsvField("tags", value)} value={metadata.tags} />
                <CsvField label="Request keywords" onChange={(value) => updateCsvField("requestKeywords", value)} value={metadata.requestKeywords} />
              </div>
            </BuilderSection>

            <BuilderSection number="03" title="Track inspection" subtitle="Track inference is deterministic and remains operator-overridable.">
              {source ? (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Track</th>
                        <th className="px-3 py-2.5">Instrument</th>
                        <th className="px-3 py-2.5">Channel</th>
                        <th className="px-3 py-2.5">Notes</th>
                        <th className="px-3 py-2.5">Range</th>
                        <th className="px-3 py-2.5">Onset density</th>
                        <th className="px-3 py-2.5">Class</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.07]">
                      {source.tracks.map((track) => (
                        <tr className="bg-black/15 text-slate-300" key={track.index}>
                          <td className="px-3 py-3 font-semibold text-slate-100">{track.index + 1}. {track.name}</td>
                          <td className="px-3 py-3">{track.instrument}</td>
                          <td className="px-3 py-3">{track.channel}</td>
                          <td className="px-3 py-3 tabular-nums">{track.noteCount}</td>
                          <td className="px-3 py-3 font-mono text-xs">{track.lowestNote && track.highestNote ? `${track.lowestNote}–${track.highestNote}` : "—"}</td>
                          <td className="px-3 py-3 tabular-nums">{track.averageNotesPerOnset} avg / {track.maxNotesPerOnset} max</td>
                          <td className="px-3 py-3"><MiniBadge tone={track.dense ? "amber" : track.noteCount > 0 ? "lime" : "slate"}>{track.dense ? "Dense" : track.noteCount > 0 ? "Clear" : "Empty"}</MiniBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Upload a MIDI file to inspect track names, channels, note counts, ranges, and polyphony.</EmptyState>
              )}
              {source ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MiniStatus label="Tempo" value={`${source.tempoBpm} BPM`} tone="passed" />
                  <MiniStatus label="Time signature" value={source.timeSignature} tone="passed" />
                  <MiniStatus label="PPQ" value={String(source.ppq)} tone="passed" />
                </div>
              ) : null}
            </BuilderSection>

            <BuilderSection number="04" title="Conversion settings" subtitle="The physical rack and role target ranges are fixed for this system.">
              <div className="grid gap-3 sm:grid-cols-3">
                <ReadonlySetting label="Rack map" value="G3-C6 · 18 natural notes" />
                <ReadonlySetting label="Melody target" value="G4-C6 · upper physical" />
                <ReadonlySetting label="Accompaniment target" value="G3-F4 · lower physical" />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Transposition">
                  <select className={inputClass} onChange={(event) => { setSettings({ ...settings, transpositionMode: event.target.value as LibraryBuilderSettings["transpositionMode"] }); setResult(null); }} value={settings.transpositionMode}>
                    <option value="auto">Auto — maximize natural rack notes</option>
                    <option value="manual">Manual override</option>
                  </select>
                </Field>
                <Field label="Manual semitones" hint="Allowed range: -24 to +24">
                  <input className={inputClass} disabled={settings.transpositionMode !== "manual"} max={24} min={-24} onChange={(event) => { setSettings({ ...settings, manualTransposition: Number(event.target.value) }); setResult(null); }} type="number" value={settings.manualTransposition} />
                </Field>
                <Field label="Melody source">
                  <select className={inputClass} onChange={(event) => { setSettings({ ...settings, melodySource: event.target.value as LibraryBuilderSettings["melodySource"] }); setResult(null); }} value={settings.melodySource}>
                    <option value="auto">Auto</option>
                    <option value="track">Choose MIDI track</option>
                    <option value="top_voice">Top voice from dense track</option>
                  </select>
                </Field>
                <TrackSelect label="Melody track" onChange={(trackIndex) => { setSettings({ ...settings, melodyTrackIndex: trackIndex }); setResult(null); }} tracks={populatedTracks} value={settings.melodyTrackIndex} />
                <Field label="Accompaniment source">
                  <select className={inputClass} onChange={(event) => { setSettings({ ...settings, accompanimentSource: event.target.value as LibraryBuilderSettings["accompanimentSource"] }); setResult(null); }} value={settings.accompanimentSource}>
                    <option value="auto">Auto</option>
                    <option value="track">Choose MIDI track</option>
                    <option value="lower_voices">Lower voices from dense track</option>
                    <option value="none">None</option>
                  </select>
                </Field>
                <TrackSelect label="Accompaniment track" onChange={(trackIndex) => { setSettings({ ...settings, accompanimentTrackIndex: trackIndex }); setResult(null); }} tracks={populatedTracks} value={settings.accompanimentTrackIndex} />
                <Field label="Max accompaniment density">
                  <select className={inputClass} onChange={(event) => { setSettings({ ...settings, accompanimentDensity: event.target.value as LibraryBuilderSettings["accompanimentDensity"] }); setResult(null); }} value={settings.accompanimentDensity}>
                    <option value="sparse">Sparse · one lower note per onset</option>
                    <option value="normal">Normal · up to two lower notes</option>
                    <option value="dense_simulator_only">Dense simulator-only · retain lower voices</option>
                  </select>
                </Field>
                <Field label="Draft status">
                  <input className={inputClass} onChange={(event) => { setSettings({ ...settings, draftStatus: event.target.value }); setResult(null); }} value={settings.draftStatus} />
                </Field>
              </div>
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Safety policy</div>
                  <div className="mt-1 text-sm font-semibold text-slate-100">demo_safe = false · validation required · no automatic repository writes</div>
                </div>
                <button
                  className="rounded-md bg-lime-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_30px_rgba(190,242,100,0.16)] hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!source || !metadata.title.trim() || !metadata.songId.trim()}
                  onClick={handleConvert}
                  type="button"
                >
                  Convert and validate draft
                </button>
              </div>
            </BuilderSection>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <BuilderSection number="05" title="Validation report" subtitle="Arrangement checks are combined with the existing motor-safety validator.">
              {result ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <MiniBadge tone={result.validationReport.overall === "FAILED" ? "red" : result.validationReport.overall === "WARNING" ? "amber" : "lime"}>{result.validationReport.overall}</MiniBadge>
                      <span className="text-sm text-slate-400">{result.validationReport.checks.filter((check) => check.status === "passed").length}/{result.validationReport.checks.length} checks passed</span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">verdict: {result.conversionReport.verdict}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {result.validationReport.checks.map((check) => (
                      <div className="rounded-lg border border-white/10 bg-black/25 p-3" key={check.label}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100">{check.label}</span>
                          <MiniBadge tone={check.status === "failed" ? "red" : check.status === "warning" ? "amber" : "lime"}>{check.status}</MiniBadge>
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-slate-400">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                  {result.conversionReport.warnings.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-3">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">Conversion warnings</div>
                      <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-amber-100/80">
                        {result.conversionReport.warnings.map((warning) => <li className="list-disc" key={warning}>{warning}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState>Run conversion to validate the G3-C6 note set, accidentals, actuator mapping, timing, repeated actuators, and simultaneous load.</EmptyState>
              )}
            </BuilderSection>

            <BuilderSection number="06" title="Arrangement JSON output" subtitle="Save this object as the song arrangement file.">
              <OutputPanel
                copyLabel="Copy arrangement JSON"
                downloadLabel="Download arrangement JSON"
                filename={`${metadata.songId || "song_id"}.json`}
                json={outputJson.arrangement}
                placeholder="Arrangement JSON will appear after conversion."
              />
              <OutputPath path={result?.outputPath ?? `frontend/public/songs/arrangements/${metadata.songId || "song_id"}.json`} />
            </BuilderSection>

            <BuilderSection number="07" title="Catalog entry output" subtitle="Paste this object into the existing catalog array; the catalog system remains authoritative.">
              <OutputPanel
                copyLabel="Copy catalog entry"
                downloadLabel="Download catalog entry"
                filename={`${metadata.songId || "song_id"}.catalog-entry.json`}
                json={outputJson.catalog}
                placeholder="Catalog entry JSON will appear after conversion."
              />
            </BuilderSection>

            <BuilderSection number="08" title="Conversion report output" subtitle="Retain this report as operator evidence of inference, omissions, density, and validation.">
              <OutputPanel
                copyLabel="Copy conversion report"
                downloadLabel="Download conversion report"
                filename={`${metadata.songId || "song_id"}.conversion-report.json`}
                json={outputJson.report}
                placeholder="Conversion report JSON will appear after conversion."
              />
            </BuilderSection>
          </div>
        </div>
      </div>
    </main>
  );
}

function BuilderSection({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-white/[0.08] pb-4">
        <span className="rounded border border-lime-300/25 bg-lime-300/10 px-2 py-1 font-mono text-xs font-bold text-lime-200">{number}</span>
        <div>
          <h2 className="text-base font-bold text-slate-50">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-slate-600">{hint}</span> : null}
    </label>
  );
}

function CsvField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string) => void }) {
  return (
    <Field label={label} hint="Comma-separated">
      <input className={inputClass} onChange={(event) => onChange(event.target.value)} placeholder="value one, value two" value={value.join(", ")} />
    </Field>
  );
}

function TrackSelect({ label, tracks, value, onChange }: { label: string; tracks: ParsedMidiSource["tracks"]; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Field label={label}>
      <select className={inputClass} disabled={tracks.length === 0} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} value={value ?? ""}>
        {tracks.length === 0 ? <option value="">Upload MIDI first</option> : null}
        {tracks.map((track) => <option key={track.index} value={track.index}>{track.index + 1}. {track.name} · {track.noteCount} notes</option>)}
      </select>
    </Field>
  );
}

function ReadonlySetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "lime" | "slate" }) {
  const className = tone === "lime" ? "border-lime-300/30 bg-lime-300/10 text-lime-100" : "border-white/10 bg-white/[0.04] text-slate-300";
  return <span className={`rounded-md border px-3 py-2 text-xs ${className}`}><span className="text-slate-500">{label}: </span><strong>{value}</strong></span>;
}

function MetricCard({ label, value, detail, tone = "slate" }: { label: string; value: string; detail: string; tone?: "slate" | "lime" | "red" }) {
  const valueTone = tone === "lime" ? "text-lime-200" : tone === "red" ? "text-red-200" : "text-slate-100";
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold ${valueTone}`} title={value}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-600" title={detail}>{detail}</div>
    </div>
  );
}

function MiniStatus({ label, value, tone }: { label: string; value: string; tone: "passed" | "warning" }) {
  return (
    <div className="flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={tone === "passed" ? "font-semibold text-lime-200" : "font-semibold text-amber-200"}>{value}</span>
    </div>
  );
}

function MiniBadge({ tone, children }: { tone: "lime" | "amber" | "red" | "slate"; children: ReactNode }) {
  const classes = {
    lime: "border-lime-300/30 bg-lime-300/10 text-lime-100",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    red: "border-red-400/30 bg-red-400/10 text-red-100",
    slate: "border-white/10 bg-white/[0.04] text-slate-400",
  }[tone];
  return <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${classes}`}>{children}</span>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-white/10 bg-black/15 px-5 py-8 text-center text-sm leading-6 text-slate-500">{children}</div>;
}

function OutputPanel({ json, placeholder, filename, copyLabel, downloadLabel }: { json: string; placeholder: string; filename: string; copyLabel: string; downloadLabel: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
    }
  }

  function downloadJson() {
    if (!json) return;
    const objectUrl = URL.createObjectURL(new Blob([`${json}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button className="rounded border border-lime-300/30 bg-lime-300/10 px-3 py-2 text-xs font-bold text-lime-100 hover:bg-lime-300/15 disabled:opacity-35" disabled={!json} onClick={copyJson} type="button">
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : copyLabel}
        </button>
        <button className="rounded border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.08] disabled:opacity-35" disabled={!json} onClick={downloadJson} type="button">
          {downloadLabel}
        </button>
      </div>
      <pre className="max-h-[430px] min-h-[170px] overflow-auto rounded-lg border border-white/10 bg-[#030508] p-4 font-mono text-[11px] leading-5 text-slate-300">
        {json || <span className="text-slate-600">{placeholder}</span>}
      </pre>
    </div>
  );
}

function OutputPath({ path }: { path: string }) {
  return (
    <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200">Exact repository path</div>
      <code className="mt-1 block break-all text-xs text-cyan-100/80">{path}</code>
    </div>
  );
}

function splitCsv(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

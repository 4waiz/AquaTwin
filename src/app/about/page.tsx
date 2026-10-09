"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { AquaTwinMark, IconChevron, IconExternal } from "@/components/icons";
import { HACKATHON, TAGLINE, TEAM_NAME, TEAM_URL } from "@/lib/brand";
import { useScenario } from "@/state/scenario";

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {children}
      <IconExternal size={11} />
    </a>
  );
}

function Block({ title, children, reveal }: { title: string; children: ReactNode; reveal?: string }) {
  return (
    <section data-reveal={reveal} className="panel px-5 py-4">
      <h2 className="label mb-3">{title}</h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

const PROVENANCE: [string, string][] = [
  ["Simulated", "Plant behaviour produced by the reference plant simulator, the stand-in for a real plant in this prototype. All live telemetry is simulated."],
  ["Modeled", "Outputs of AquaTwin's hybrid model (physics + ML residual), e.g. predictions, expectations and forecasts."],
  ["Estimated", "Derived quantities with material outside uncertainty, e.g. carbon from an average grid intensity."],
  ["Assumed", "Design choices and parameters without a specific source (flagged in the code and model documentation)."],
  ["External ref.", "Values taken from published sources: membrane datasheets, seawater property correlations, WHO guidance, grid data."],
  ["Measured", "Not used. AquaTwin has not been connected to a real plant; no value in this prototype is a plant measurement."],
];

const METHODS: { what: string; ref: string; href: string }[] = [
  { what: "Seawater osmotic pressure and density", ref: "Sharqawy, Lienhard & Zubair (2010), as implemented in WaterTAP", href: "https://doi.org/10.5004/dwt.2010.1079" },
  {
    what: "Solution–diffusion RO transport, 0D/1D structure",
    ref: "WaterTAP reverse osmosis models",
    href: "https://watertap.readthedocs.io/en/latest/technical_reference/unit_models/reverse_osmosis_0D.html",
  },
  {
    what: "Membrane element data, design limits, normalisation",
    ref: "DuPont FilmTec™ SW30 datasheets and technical manual",
    href: "https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-NF-FilmTec-Manual-45-D01504-en.pdf",
  },
  { what: "Standardised (normalised) RO performance", ref: "ASTM D4516-19a", href: "https://doi.org/10.1520/D4516-19A" },
  {
    what: "Isobaric energy recovery",
    ref: "Energy Recovery, Inc. PX Q400 white paper (2025)",
    href: "https://energyrecovery.com/wp-content/uploads/2024/11/Whitepaper_PXQ400_Highly_Efficient_Energy_Recovery_Device.pdf",
  },
  { what: "Physics-guided machine learning", ref: "Willard et al. (2023), ACM Computing Surveys", href: "https://doi.org/10.1145/3514228" },
  { what: "Conformal prediction intervals", ref: "Angelopoulos & Bates (2023)", href: "https://doi.org/10.1561/2200000101" },
  { what: "Out-of-distribution detection (Mahalanobis)", ref: "Lee et al. (2018), NeurIPS", href: "https://arxiv.org/abs/1807.03888" },
  { what: "Gradient-boosted trees", ref: "scikit-learn HistGradientBoostingRegressor (Pedregosa et al., 2011)", href: "https://jmlr.org/papers/v12/pedregosa11a.html" },
  { what: "Drinking-water quality context", ref: "WHO, Safe drinking-water from desalination (2011)", href: "https://iris.who.int/handle/10665/70621" },
  { what: "Grid carbon intensity (UAE, lifecycle)", ref: "Ember via Our World in Data", href: "https://ourworldindata.org/grapher/carbon-intensity-electricity" },
  { what: "Harmful algal blooms and desalination", ref: "IOC-UNESCO Manuals and Guides No. 78 (2017)", href: "https://unesdoc.unesco.org/ark:/48223/pf0000259512" },
];

/**
 * The hackathon's six themes are its "UN Water pillars". AquaTwin is entered
 * under pillar 3; the others are where its mechanisms contribute. Figures are
 * simulated results from the Validation page.
 */
const PILLARS: { n: string; title: string; body: string; href: string; cta: string; primary?: boolean }[] = [
  {
    n: "01",
    title: "Water security & sustainable desalination",
    body: "Keeps SWRO output on specification and on demand through Gulf stresses. Under a +15 % salinity shock, fixed setpoints violate a limit for 21.3 h of 24; AquaTwin for none.",
    href: "/scenarios",
    cta: "Scenario Lab",
  },
  {
    n: "02",
    title: "Water reuse, circularity & resource efficiency",
    body: "Treats membranes as assets: cleaning is planned from a fouling forecast about half a day ahead instead of being triggered by a threshold, and fouling rate is an optimisation objective.",
    href: "/membranes",
    cta: "Membrane Health",
  },
  {
    n: "03",
    title: "Smart, digital & AI-enabled water systems",
    body: "Physics-informed machine learning with calibrated uncertainty: permeate-flow error 4.9 m³/h per train, against 48.0 for the calibrated physics and 9.7 for machine learning alone.",
    href: "/intelligence",
    cta: "Model Intelligence",
    primary: true,
  },
  {
    n: "04",
    title: "Water quality, health & environmental protection",
    body: "Permeate quality is a hard limit, checked at the edge of the model's uncertainty; quality excursions are forecast two hours ahead and rehearsed before they happen.",
    href: "/water-quality",
    cta: "Water Quality",
  },
  {
    n: "05",
    title: "Energy–water nexus & climate resilience",
    body: "Energy and carbon are first-class objectives. Grid power caps are honoured by pre-filling storage, and the energy cost of resilience is reported, not hidden: 0 to +2.8 % specific energy.",
    href: "/energy",
    cta: "Energy & Carbon",
  },
  {
    n: "06",
    title: "Integrated systems, governance & cooperation",
    body: "Built to be audited: every number is labelled by provenance, every recommendation states the limits it was checked against, and outside its validated envelope the twin withholds advice.",
    href: "/validation",
    cta: "Validation",
  },
];

const SOFTWARE: [string, string][] = [
  ["Next.js", "MIT"],
  ["React", "MIT"],
  ["three.js", "MIT"],
  ["Tailwind CSS", "MIT"],
  ["Zustand", "MIT"],
  ["d3-scale · d3-shape · d3-array", "ISC"],
  ["Motion", "MIT"],
  ["Geist and Geist Mono", "SIL OFL 1.1"],
  ["scikit-learn", "BSD-3-Clause"],
  ["NumPy · pandas", "BSD-3-Clause"],
  ["TypeScript · tsx", "Apache-2.0 · MIT"],
  ["Playwright (QA)", "Apache-2.0"],
];

export default function AboutPage() {
  useEffect(() => useScenario.getState().setActive(false), []);
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-5 pt-6 max-lg:p-4">
      <header
        data-reveal="header"
        className="relative overflow-hidden rounded-[14px] border border-line bg-ink-900 px-7 py-6 max-sm:px-5"
        style={{
          backgroundImage:
            "radial-gradient(900px 260px at 0% 0%, rgb(34 181 251 / 0.13), transparent 60%), radial-gradient(700px 240px at 100% 120%, rgb(67 203 198 / 0.08), transparent 60%)",
        }}
      >
        <div className="flex items-center gap-6 max-sm:flex-col max-sm:items-start max-sm:gap-4">
          <AquaTwinMark size={84} glow />
          <div className="min-w-0">
            <div className="label">{HACKATHON} · Theme 3</div>
            <h1 className="mt-1.5 text-[32px] font-semibold leading-none tracking-tight text-fg max-sm:text-[28px]">
              Aqua<span className="brand-text">Twin</span>
            </h1>
            <p className="mt-2 max-w-[720px] text-[14.5px] leading-snug text-fg-muted">{TAGLINE}</p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              {["Physics + ML residual", "Calibrated uncertainty", "AquaGuard safety layer", "Withholds outside its envelope", "Runs in the browser"].map((t) => (
                <span key={t} className="inline-flex h-6 items-center rounded-md border border-line-strong bg-ink-850/80 px-2 text-[11.5px] text-fg-muted">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section data-reveal="panel1" className="panel px-5 py-4" aria-labelledby="pillars-title">
        <div className="mb-3 flex items-baseline justify-between gap-4 max-sm:flex-col max-sm:gap-1">
          <h2 id="pillars-title" className="label">
            Aligned with the UN Water pillars
          </h2>
          <p className="text-[11.5px] text-fg-subtle">The hackathon&apos;s six themes · SDG 6 · simulated results</p>
        </div>
        <ul className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
          {PILLARS.map((p) => (
            <li
              key={p.n}
              className={`group relative flex flex-col rounded-[10px] border p-4 transition-colors ${
                p.primary ? "border-accent/45 bg-accent-soft/35" : "border-line bg-ink-900 hover:border-line-strong"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`num font-mono text-[11px] tracking-wider ${p.primary ? "text-accent" : "text-fg-subtle"}`}>{p.n}</span>
                {p.primary && (
                  <span className="inline-flex h-5 items-center rounded border border-accent/40 px-1.5 font-mono text-[9.5px] tracking-wider text-accent uppercase">
                    Our theme
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-[13.5px] font-medium leading-snug text-fg">{p.title}</h3>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-fg-muted">{p.body}</p>
              <Link
                href={p.href}
                className="mt-3 inline-flex items-center gap-1 self-start text-[12px] font-medium text-accent transition-colors hover:text-fg"
              >
                {p.cta}
                <IconChevron size={12} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Block title="About this prototype" reveal="panel1">
            <p>
              AquaTwin is a digital twin for seawater reverse-osmosis (SWRO) desalination. It combines a reduced-order physical model of the plant with a machine-learning
              residual that corrects what the physics misses, calibrates itself continuously against telemetry, forecasts membrane degradation, and recommends operating
              strategies that a deterministic safety layer, AquaGuard, must approve before they are shown to an operator.
            </p>
            <p>
              Built by{" "}
              <a
                href={TEAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-fg underline decoration-line-bright underline-offset-2 hover:decoration-accent"
              >
                {TEAM_NAME}
              </a>{" "}
              for the {HACKATHON}, theme <span className="text-fg">Smart, Digital, and AI-Enabled Water Systems</span>.
            </p>
            <p>
              This is a research prototype. The plant it monitors is simulated: a higher-fidelity reference plant model stands in for a real SWRO facility so that ground
              truth is known and every claim can be tested. It is not connected to any real plant and is not intended for operational use.
            </p>
          </Block>

          <Block title="Where the numbers come from" reveal="panel2">
            <dl className="divide-y divide-line">
              {PROVENANCE.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2 first:pt-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
                  <dt className="font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">{k}</dt>
                  <dd className="text-[12.5px]">{v}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block title="Disclaimers" reveal="panel3">
            <p>
              No organisation named in this prototype or its documentation (including utilities, plant operators, equipment manufacturers, universities or UN agencies)
              has reviewed, endorsed or partnered with AquaTwin. Names appear only to cite published sources or to describe the hackathon.
            </p>
            <p>
              Performance figures are simulation results or model estimates and are labelled as such. They have not been validated on an industrial plant. AquaTwin does
              not use a language model for any prediction, control or safety decision.
            </p>
          </Block>
        </div>

        <div className="flex flex-col gap-4">
          <Block title="The one-minute film" reveal="panel2">
            <video
              className="aspect-video w-full rounded-md border border-line bg-ink-950"
              controls
              preload="none"
              playsInline
              poster="/media/aquatwin-film.jpg"
              aria-label="AquaTwin: the one-minute film"
            >
              <source src="/media/aquatwin-film.mp4" type="video/mp4" />
              <track kind="captions" src="/media/aquatwin-film.vtt" srcLang="en" label="English (also burned in)" />
            </video>
            <p className="text-[12px] text-fg-subtle">
              AquaTwin in under a minute: a narrated motion-graphics pitch built from this application and its own simulation results. Every result shown is
              simulated. By{" "}
              <a href={TEAM_URL} target="_blank" rel="noopener noreferrer" className="text-fg-muted underline decoration-line-bright underline-offset-2 hover:decoration-accent">
                {TEAM_NAME}
              </a>
              . Voice: Kokoro-82M. Music: original, generated for the film. Sound effects: Kenney (CC0).
            </p>
          </Block>

          <Block title="Methods and data sources" reveal="panel2">
            <ul className="divide-y divide-line">
              {METHODS.map((m) => (
                <li key={m.what} className="py-2 first:pt-0 last:pb-0">
                  <div className="text-[12.5px] text-fg">{m.what}</div>
                  <div className="text-[12px]">
                    <Ext href={m.href}>{m.ref}</Ext>
                  </div>
                </li>
              ))}
            </ul>
            <p className="pt-1 text-[11.5px] text-fg-subtle">The full reference list, with notes on what was and was not verified, is in docs/REFERENCES.md.</p>
          </Block>

          <Block title="Open-source software" reveal="panel3">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-sm:grid-cols-1">
              {SOFTWARE.map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="text-fg">{k}</span>
                  <span className="font-mono text-[10.5px] text-fg-subtle">{v}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Credits" reveal="panel4">
            <p>
              Concept, engineering, modelling and design:{" "}
              <a
                href={TEAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-fg underline decoration-line-bright underline-offset-2 hover:decoration-accent"
              >
                {TEAM_NAME}
              </a>
              .
            </p>
            <p className="text-[12px] text-fg-subtle">
              Prototype version 0.1 · synthetic data seed 20261101 · all experiments reproducible from the scripts in the repository.
            </p>
          </Block>
        </div>
      </div>
    </div>
  );
}

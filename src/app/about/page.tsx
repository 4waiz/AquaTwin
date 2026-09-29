"use client";
import { useEffect, type ReactNode } from "react";
import { AquaTwinMark, IconExternal } from "@/components/icons";
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
  ["Simulated", "Plant behaviour produced by the reference plant simulator — the stand-in for a real plant in this prototype. All live telemetry is simulated."],
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
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-5 pt-6">
      <div data-reveal="header" className="flex items-center gap-4 pb-2">
        <AquaTwinMark size={40} />
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">AquaTwin</h1>
          <p className="text-[14px] text-fg-muted">{TAGLINE}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
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
                <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2 first:pt-0 last:pb-0">
                  <dt className="font-mono text-[10.5px] uppercase tracking-wider text-fg-subtle">{k}</dt>
                  <dd className="text-[12.5px]">{v}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block title="Disclaimers" reveal="panel3">
            <p>
              No organisation named in this prototype or its documentation — including utilities, plant operators, equipment manufacturers, universities or UN agencies —
              has reviewed, endorsed or partnered with AquaTwin. Names appear only to cite published sources or to describe the hackathon.
            </p>
            <p>
              Performance figures are simulation results or model estimates and are labelled as such. They have not been validated on an industrial plant. AquaTwin does
              not use a language model for any prediction, control or safety decision.
            </p>
          </Block>
        </div>

        <div className="flex flex-col gap-4">
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
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
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

# AquaTwin: verified research notes (SWRO digital twin)

Compiled 2026-09-28 for Team Kanban, Khalifa University–UNESCO Global Water Hackathon 2026.

**Confidence labels used throughout**

- **VERIFIED**: read directly in the primary source during this session (source code, official docs, datasheet, standard's official page, or paper text).
- **APPROX**: derived by us from verified inputs (method shown), or taken from a credible secondary source that cites the primary.
- **UNVERIFIED**: could not be checked against a primary source (paywall, bot protection, or not found). Do not present as fact without a caveat.

Numbers in [brackets] refer to the Reference list at the end.

---

## 1. Seawater osmotic pressure

### 1a. WaterTAP seawater property package

**Where it comes from.** `watertap/property_models/seawater_prop_pack.py` on the `main` branch [1]. The file was last changed in commit `5bfe7940ba` (2026-08-27); repo HEAD was `af39981a4e` on 2026-09-28, and the latest release is 1.7.0. Docs page: [2].

**General behaviour** (VERIFIED [2]):
- Components are H2O (solvent) and TDS (solute); liquid phase only.
- Mass basis: the state variables are `flow_mass_phase_comp`, T and P.
- Molar properties use an average molecular weight of sea salt.

**Molecular weights** (VERIFIED [1], [5]). Units are kg/mol:
```python
mw_comp_data = {
    "H2O": 18.01528e-3,
    "TDS": 31.4038218e-3,
}
# molecular weight of TDS is taken as the average atomic weight of sea salt, based on
# "Reference-Composition Salinity Scale" in Millero et al. (2008) and cited by Sharqawy et al. (2010)
```

**Osmotic coefficient** (VERIFIED [1], [3]). This is Sharqawy et al. (2010), eq. 49. The code comment gives the range "0-200 C, 0-120 g/kg".
```python
# Sharqawy et al. (2010), eq. 49, 0-200 C, 0-120 g/kg
def rule_osm_coeff(b):
    s = b.mass_frac_phase_comp["Liq", "TDS"]
    # temperature in degC, but pyunits are still K
    t = b.temperature - 273.15 * pyunits.K
    osm_coeff = (
        b.params.osm_coeff_param_1
        + b.params.osm_coeff_param_2 * t
        + b.params.osm_coeff_param_3 * t**2
        + b.params.osm_coeff_param_4 * t**4
        + b.params.osm_coeff_param_5 * s
        + b.params.osm_coeff_param_6 * s * t
        + b.params.osm_coeff_param_7 * s * t**3
        + b.params.osm_coeff_param_8 * s**2
        + b.params.osm_coeff_param_9 * s**2 * t
        + b.params.osm_coeff_param_10 * s**2 * t**2
    )
```
The same equation written out, with coefficients from the code (identical to Sharqawy Table 10):
```
phi(t,S) = a1 + a2*t + a3*t^2 + a4*t^4 + a5*S + a6*S*t + a7*S*t^3 + a8*S^2 + a9*S^2*t + a10*S^2*t^2

t = T[K] - 273.15  (deg C)
S = TDS mass fraction in kg/kg  (NOT g/kg)

a1 =  8.9453e-1    a2 =  4.1561e-4  [1/K]    a3 = -4.6262e-6 [1/K^2]   a4 = 2.2211e-11 [1/K^4]
a5 = -1.1445e-1    a6 = -1.4783e-3  [1/K]    a7 = -1.3526e-8 [1/K^3]
a8 =  7.0132       a9 =  5.696e-2   [1/K]    a10 = -2.8624e-4 [1/K^2]
```

**Molality** (VERIFIED [1]). This gives mol TDS per kg of water:
```python
def rule_molality_phase_comp(b, p, j):
    return (
        self.molality_phase_comp[p, j]
        == b.mass_frac_phase_comp[p, j]
        / (1 - b.mass_frac_phase_comp[p, j])
        / b.params.mw_comp[j]
    )
```

**Osmotic pressure** (VERIFIED [1], [2]):
```python
# Nayar et al. (2016), eq. 48, 0-200 C, 0-120 g/kg
def rule_pressure_osm_phase(b, p):
    i = 2  # number of ionic species
    rhow = b.dens_mass_solvent
    return (
        b.pressure_osm_phase[p]
        == b.osm_coeff
        * b.molality_phase_comp[p, "TDS"]
        * rhow
        * Constants.gas_constant
        * b.temperature
    )
```
```
pi [Pa] = phi(t,S) * m_TDS [mol/kg] * rho_w(t) [kg/m3] * R [J/mol/K] * T [K]
m_TDS   = x_TDS / ((1 - x_TDS) * MW_TDS),   MW_TDS = 0.0314038218 kg/mol
R       = IDAES Constants.gas_constant (the docs quote 8.314 J/mol/K)
```

**Key finding: there is no factor 2 in the seawater package** (VERIFIED [1], [2], [4]).
- `i = 2` is assigned in the code but never used.
- It has been unused since at least 2021. I checked commits `1a7aaa4707` (2021-10-07), `7f527e1b1b` (2022-02-03), `32af858149` (2024-03-22) and current `main`.
- The docs give the formula without the factor: "π = φ · Cm · ρw · R · T" [2].
- This is correct, not a bug. Nayar et al. (2016, §11.2) use the Robinson–Stokes form π = φ·R·T·ρ_w·Σ_j m_j, summed over **all** dissolved species [4].
- MW_s = 31.4038 g/mol is "the weighted average of the molecular weight of each dissolved solute" [4]. So m_TDS already equals Σ m_j, and multiplying by 2 would double-count.
- The equation number differs by version: the MIT preprint of Nayar et al. numbers it eq. 44–45, while WaterTAP cites "eq. 48" (the published numbering).

**The NaCl package is different, so do not mix conventions** (VERIFIED [9], [6]). `NaCl_prop_pack.py` does use i = 2:
```
pi = 2 * phi * m_NaCl * 1000 [kg/m3, fixed] * R * T
MW_NaCl = 58.44 g/mol
phi = 0.918 + 0.0889*w + 4.92*w^2     (w = NaCl mass fraction; Bartholomew & Mauter 2019, eq. 3b)
```

**Pure-water density ρ_w(t)**, Sharqawy eq. 8 (A-terms). WaterTAP uses this as `dens_mass_solvent` (VERIFIED [1], [3]):
```
rho_w = A1 + A2*t + A3*t^2 + A4*t^3 + A5*t^4        [kg/m3], t in deg C
A1 = 9.999e2, A2 = 2.034e-2, A3 = -6.162e-3, A4 = 2.261e-5, A5 = -4.657e-8
```

**Seawater density**, the full Sharqawy eq. 8 (VERIFIED [1], [3]):
```
rho_sw = rho_w(t) + B1*S + B2*S*t + B3*S*t^2 + B4*S*t^3 + B5*S^2*t^2      [kg/m3], S in kg/kg
B1 = 8.020e2, B2 = -2.001, B3 = 1.677e-2, B4 = -3.060e-5, B5 = -1.613e-5
Paper validity (Table 2): 0 < t < 180 C; 0 < S < 0.16 kg/kg; accuracy +/-0.1 %; no pressure term
```
- The WaterTAP code comment says "0-180 C, 0-150 g/kg, 0-12 MPa". The paper states 0–0.16 kg/kg and has no pressure dependence. Use the paper range.
- Evaluated with these equations: ρ_sw(35 g/kg, 25 °C) = 1023.6 kg/m³.

**Validity caveats** (APPROX, our reading of the equations):
- The WaterTAP docs say "properties do not incorporate validity ranges for temperature and salinity" [2].
- Eq. 49 is fitted for S ≥ 10 g/kg. As S → 0 it gives φ ≈ 0.895 instead of 1, so permeate-side π is slightly under-predicted. This is negligible for SWRO, where the permeate π is only about 0.1–0.3 bar.
- Nayar et al. (2016) extend the correlation below 10 g/kg with a Brønsted-equation blend [4].

**Other properties in the same package** that the mass-transfer model needs (VERIFIED formulas [1]; values are our evaluation):
- **Dynamic viscosity**, Sharqawy eqs. 22–23:
  - μ_w = 4.2844e-5 + [0.157·(t + 64.993)² − 91.296]⁻¹
  - μ_sw = μ_w·(1 + A·S + B·S²), with A = 1.541 + 1.998e-2·t − 9.52e-5·t² and B = 7.974 − 7.561e-2·t + 4.724e-4·t² (Pa·s)
  - μ_sw(35 g/kg, 25 °C) = 0.959 mPa·s. At 15 °C it is 1.220; at 35 °C it is 0.778.
- **Diffusivity**, an NaCl stand-in at 25 °C (Bartholomew & Mauter 2019, eq. 6):
  - D = 1.51e-9 − 2.00e-9·w + 3.01e-8·w² − 1.22e-7·w³ + 1.53e-7·w⁴ m²/s
  - D ≈ 1.47e-9 m²/s at w = 0.035
  - There is no temperature dependence in WaterTAP.

### 1b. The original source: Sharqawy, Lienhard & Zubair (2010)

- **Citation** (VERIFIED via Crossref [3]): Desalination and Water Treatment 16(1–3):354–380, April 2010, DOI 10.5004/dwt.2010.1079. An open copy is hosted by MIT.
- **Validity of eq. 49** (VERIFIED, Table 10, "Present work based on Bromley's et al. data"):
  - 0 ≤ t ≤ 200 °C and 10 ≤ S ≤ 120 g/kg.
  - Accuracy ±1.4 % against the Bromley et al. data; correlation coefficient 0.991.
- **Text vs table inconsistency.** The running text says "a salinity range of 0.01–120 g/kg", which does not match Table 10. Use 10–120 g/kg. Nayar et al. (2016) also describe the Bromley data as 10–120 g/kg [4].
- **Errata.** The MIT copy has five "short note of correction" pages. They fix eqs. 6, 7, 14, 17 and 21 and one reference. **Eqs. 8 and 49 are unaffected** (VERIFIED).
- **Nayar et al. (2016), Table 12**, re-lists the Bromley correlation (VERIFIED [4]):
  - range 0 ≤ t ≤ 120 °C, 10 ≤ S ≤ 120 g/kg
  - U_max ±2.57 %
  - adds a Brønsted-equation branch for S < 10 g/kg

### 1c. Sanity value: standard seawater, 35 g/kg at 25 °C

**Answer: ≈ 25.9 bar, not 27–28 bar.**

- **WaterTAP seawater formulation** (APPROX, our evaluation of the verified equations): φ = 0.9068, m = 1.1549 mol/kg, ρ_w = 996.9 kg/m³, giving **π = 25.9 bar (2.59 MPa)**.
- **Independent check with TEOS-10** (VERIFIED [8], [7]):
  - The official GSW function page `gsw_osmotic_pressure_t_exact` gives an example of **256.46 dbar = 25.65 bar** at S_A = 35.0256 g/kg, t = 22.81 °C and a pure-water-side pressure of 125 dbar.
  - The page cites the TEOS-10 Manual, IOC Manuals & Guides 56, §3.41 [7].
  - The WaterTAP formulation reproduces all six GSW example points within −0.3 % to +0.4 % (APPROX, our comparison).
- **Where 27–28 bar comes from: a 35 g/kg NaCl solution** (APPROX).
  - WaterTAP's NaCl package gives 28.5 bar at 35 g/kg and 25 °C.
  - NaCl has more dissolved particles per gram than sea salt (29.2 vs 31.4 g/mol per particle) and a higher φ.
- **DuPont's practical approximation** (VERIFIED formula [19], manual Eq. 76) gives **26.4 bar** at 35,000 mg/L and 25 °C:
  ```
  pi_fc = (0.0117*C_fc - 34)/14.23 * (T + 320)/345   [bar]
  ```
  - The manual prints "for C_fc < 20000 mg/L" for both Eq. 75 and Eq. 76.
  - The two forms coincide at 20,000 mg/L (14.05 bar), so Eq. 76 is evidently meant for C_fc > 20,000 mg/L.

**Quick table, WaterTAP seawater formulation** (APPROX, our evaluation), in bar:

| T (°C) | 35 g/kg | 40 g/kg | 45 g/kg | 70 g/kg |
|---|---|---|---|---|
| 15 | 25.0 | 28.8 | 32.7 | 53.3 |
| 25 | 25.9 | 29.8 | 33.8 | 55.2 |
| 35 | 26.7 | 30.8 | 34.9 | 57.0 |

---

## 2. RO transport model (WaterTAP solution–diffusion)

**Sources.**
- Docs: https://watertap.readthedocs.io/en/latest/technical_reference/unit_models/reverse_osmosis_0D.html. The 1D page points to the same equations [10].
- Code [11]:
  - `watertap/unit_models/reverse_osmosis_base.py`, last changed in `0effea84f4` (2026-06-29)
  - `watertap/core/membrane_channel_base.py`, last changed in `e50196ee10` (2026-02-09)
- The model is isothermal and steady-state. It supports the SD and SKK transport models and flat-sheet or spiral-wound modules [10].

**Equations as documented and implemented** (VERIFIED in docs [10] and code [11]):
```
Water flux (SD):     J_w = rho_solvent * A * [ (P_f - P_p) - (pi_f,interface - pi_p) ]    [kg m^-2 s^-1]
                     (code: bulk feed pressure minus permeate pressure; interface osmotic pressure;
                      rho_solvent is a fixed Param = 1000 kg/m3)
Solute flux (SD):    J_s = B * (C_f,interface - C_p)                                        [kg m^-2 s^-1]
SKK variant:         J_w = rho*A*(dP - sigma*dpi);  J_s = B*(C_f - C_p) + (1 - sigma)*(J_w/rho)*C_f;  alpha = (1 - sigma)/B
0D averaging:        J_avg = 0.5*(J_in + J_out);   M_p,j = A_m * J_avg,j
Concentration polarization (film model incl. solute flux):
                     C_interface = C_bulk*exp(J_v/k_f) - (J_s/J_v)*(exp(J_v/k_f) - 1),   J_v = J_w/rho_solvent
                     CP_mod = C_interface/C_bulk        (option: fixed CP_mod instead)
Mass transfer:       k_f = D*Sh/d_h
Sherwood:            Sh = 0.46*(Re*Sc)^0.36
Schmidt:             Sc = mu/(rho*D)
Reynolds:            Re = rho*v_f*d_h/mu
Hydraulic diameter:  d_h = 4*eps_sp / ( 2/h_ch + (1 - eps_sp)*8/h_ch )     (code: "eqn. 17 in Schock & Miquel, 1987")
Cross-section:       A_c = h_ch*W*eps_sp ;   v_f = Q_f/A_c
Membrane area:       A_m = L*W (flat sheet);   A_m = 2*L*W (spiral wound)
Darcy friction:      f = 0.42 + 189.3/Re     (flat sheet; code: "eq. S27 in SI for Cost Optimization of OARO")
                     f = 6.23*Re^(-0.3)      (spiral wound; code: "eq. 24 ... (Schock & Miquel, 1987)")
Pressure gradient:   dP/dx * d_h = -0.5 * f * rho * v_f^2       (code sign convention)
0D pressure drop:    dP = (dP/dx)_avg * L
Recovery/rejection:  R_vol = Q_p/Q_f,in ;   r_j = 1 - C_p,mix/C_f,in
Initial pressure:    P_op = over_pressure_factor * pi_brine    (helper calculate_operating_pressure;
                     default factor 1.15; RO_with_energy_recovery example uses 1.3)
```

**Provenance of the correlations.**
- WaterTAP gives no citation for Sh = 0.46(Re·Sc)^0.36. It is often attributed to Guillen & Hoek (2009) [13]. That paper exists (DOI verified), but I could not read the full text, so the attribution is **UNVERIFIED**.
- Schock & Miquel (1987) [14] exists (DOI verified). The code cites it for d_h and for the spiral-wound friction factor; I did not read the paper itself.

**Variable bounds in the code** (VERIFIED [11]):

| Variable | Bounds | Initial value |
|---|---|---|
| `A_comp` | 1e-18 to 1e-6 m s⁻¹ Pa⁻¹ | 1e-12 |
| `B_comp` | 1e-11 to 1e-5 m/s | 1e-8 |
| Water mass flux | 1e-4 to 3e-2 kg m⁻² s⁻¹ | |
| N_Sh | 1 to 300 | |
| N_Re | 10 to 5000 | |

**SWRO example parameters in WaterTAP flowsheets** (VERIFIED [12]):

| Parameter | `RO_with_energy_recovery.py` | `seawater_RO_desalination.py` |
|---|---|---|
| Property package | NaCl_prop_pack | MCAS |
| Feed | 35 g/kg mass fraction, 25 °C, 101325 Pa | 35 kg/m³ TDS |
| A_comp | **4.2e-12 m s⁻¹ Pa⁻¹** | 4.2e-12 |
| B_comp | **3.5e-8 m s⁻¹** | 3.5e-8 (TSS: 1e-10) |
| Feed channel height | 1e-3 m | 1e-3 m |
| Spacer porosity | 0.85 | 0.9 |
| Permeate pressure | 101325 Pa | 101325 Pa |
| HP pump efficiency | 0.80 | 0.80 |
| Pressure exchanger efficiency | 0.95 | 0.95 |
| Booster pump efficiency | 0.80 | 0.80 |
| Turbine-type ERD efficiency (alternative) | 0.95 | 0.95 |
| Default water recovery | 0.5 (mass) | n/a |

**Unit conversions** (arithmetic):
```
A = 4.2e-12 m s^-1 Pa^-1 x 1000 L/m3 x 3600 s/h x 1e5 Pa/bar = 1.512 L m^-2 h^-1 bar^-1 (LMH/bar)
B = 3.5e-8 m/s           x 1000 L/m3 x 3600 s/h              = 0.126 L m^-2 h^-1 (LMH)
```

**Cross-check against DuPont datasheets** (APPROX, our derivation; datasheets in §3):

| Element | A (LMH/bar) | A (m s⁻¹ Pa⁻¹) | B (LMH) | B (m/s) |
|---|---|---|---|---|
| SW30HRLE-440i | ≈ 1.16 | 3.2e-12 | ≈ 0.056 | 1.55e-8 |
| SW30XLE-440i | ≈ 1.44 | 4.0e-12 | ≈ 0.069 | 1.9e-8 |

- WaterTAP's A is close to the low-energy SW30XLE element.
- WaterTAP's B is roughly twice the value implied by stabilized rejection. It is closer to what the minimum rejection of 99.6 % implies (about 0.10–0.14 LMH).

Derivation method (DuPont test conditions, WaterTAP NaCl osmotic model):
```
J     = Q_perm / (41 m2 * 24 h)                          -> 30.7 LMH (HRLE), 38.1 LMH (XLE)
CF_lm = ln(1/(1-Y))/Y  with Y = 0.08                     (DuPont Eq. 77 form)
pf    = exp(0.7*Y)                                       (DuPont Eq. 55)
pi_m  = pi_NaCl(32,000 ppm * CF_lm * pf, 25 C)           ~ 28.8 bar
NDP   = 55.16 bar - (pi_m - pi_p)                        ~ 26.4 bar   (feed-side dP neglected)
A     = J/NDP ;   C_p = (1 - R)*C_f ;   B = J*C_p/(C_f*CF_lm*pf - C_p)
```

**Caveat on pairing A/B with an osmotic model** (APPROX). The example A/B values are paired with the NaCl osmotic model. The seawater package gives about 9 % lower π at the same mass fraction, so the same A will predict higher flux. Recalibrate A and B against the osmotic model you actually use.

---

## 3. Membrane manufacturer data (DuPont FilmTec)

### 3a. Element datasheets (VERIFIED [15], [16])

| Item | SW30HRLE-440i [15] | SW30XLE-440i [16] |
|---|---|---|
| Document | Form 45-D00965-en, Rev. 5, Nov 2024 | Form 45-D00974-en, Rev. 7, Jan 2026 |
| Active area | 440 ft² (41 m²) | 440 ft² (41 m²) |
| Feed spacer | 28 mil | 28 mil |
| Permeate flow | 8,000 gpd (30.2 m³/d) | 9,900 gpd (37.5 m³/d) |
| Stabilized salt rejection | 99.80 % | 99.8 % |
| Minimum salt rejection | 99.65 % | 99.6 % |
| Stabilized boron rejection | 92 % | 91.5 % |
| Flow tolerance | "no more than 15% below" nominal | "no more than 20% below" nominal |
| Standard test conditions | 32,000 ppm NaCl, 5 ppm boron, 800 psi (55 bar), 25 °C, pH 8, 8 % recovery | same |
| Max operating pressure | 1,200 psi (83 bar) | same |
| Max temperature | 45 °C (35 °C for continuous operation above pH 10) | same |
| Max ΔP per element | 15 psi (1.0 bar) | same |
| Max ΔP per vessel (≥ 4 elements) | 50 psi (3.5 bar) | same |
| pH, continuous / short-term cleaning (30 min) | 2–11 / 1–13 | same |
| Max feed SDI | 5 | same |
| Free chlorine | < 0.1 ppm | same |

- Stabilized rejection "is generally achieved within 24-48 hours of continuous use" [15].
- **Usage Tech Fact** (Form 45-D01706-en, Rev 4, Jun 2025 [18]), VERIFIED:
  - "Maximum pressure drops are 15psi (1.0 bar) per element or 50 psi (3.4 bar) per multi-element pressure vessel (housing), whichever value is more limiting." Note 3.4 bar here vs 3.5 bar on the datasheet (a rounding difference).
  - Start-up: raise feed pressure over 30–60 s and cross-flow over 15–20 s. Discard the first hour of permeate.

### 3b. System design limits for 8-inch elements, seawater

Source: Design Guidelines, Form 45-D01695-en, Rev 14, Feb 2026 [17] (VERIFIED).

| Seawater feed class → | Well or open intake with UF (SDI < 2.5) | Open intake, generic membrane filtration or advanced conventional (SDI < 3) | Open intake, generic conventional pretreatment (SDI < 5) |
|---|---|---|---|
| Max element recovery | 15 % | 14 % | 13 % |
| Max permeate flow, 440 ft² element | 9,200 gpd | 8,800 gpd | 8,360 gpd |
| Design (average system) flux | 9–11 gfd (15–19 LMH) | 8–10 gfd (14–17 LMH) | 7–10 gfd (12–17 LMH) |
| Max element flux | 21 gfd (36 LMH) | 20 gfd (34 LMH) | 19 gfd (32 LMH) |
| Min concentrate flow per vessel, SW elements | 13 gpm (3.0 m³/h) | 14 gpm (3.2 m³/h) | 15 gpm (3.4 m³/h) |
| Max feed flow per vessel, SW 400 ft² (37.2 m²) | 70 gpm (16 m³/h) | 66 gpm (15 m³/h) | 62 gpm (14 m³/h) |
| Max feed flow per vessel, SW 380 ft² | 70 gpm (16 m³/h) | 66 gpm (15 m³/h) | 62 gpm (14 m³/h) |
| Max feed flow per vessel, SW 370 ft² | 63 gpm (14 m³/h) | 60 gpm (13.5 m³/h) | 56 gpm (13 m³/h) |

- Rev 14 has **no max-feed-flow row for 440 ft² SW elements**. Using the 400 ft² value for a 440i element is an assumption (**UNVERIFIED** for 440 ft²).
- Rev 14 has no separate beach-well column; well intake is grouped with "Well or Open Intake with Ultrafiltration".
- Staying within these limits should give "no more than about four cleanings per year" [17].

### 3c. Concentration-polarization factor ("beta")

- **DuPont** (VERIFIED [19], Table 27, Eq. 55): pf_i = exp(0.7·Y_i) for 8-inch elements, where Y_i is the element recovery.
  - This gives pf ≈ 1.10 at 13–15 % element recovery (our evaluation).
  - The DuPont documents I read state **no explicit "β ≤ 1.2" cap**. They limit element recovery instead.
- **Hydranautics** (VERIFIED text [20]): CPF = K_p·exp(2R_i/(2 − R_i)).
  - Quote: "The value of the Concentration Polarization Factor of 1.20, which is the recommended Hydranautics limit, corresponds to 18% permeate recovery for a 40" long membrane element."
  - The document is dated 01/23/01 and hosted by a distributor mirror (Lenntech), not membranes.com.

### 3d. Temperature correction factor

Source: DuPont manual Rev. 20 (Aug 2026), §5.6.6 Eq. 73–74, repeated as Table 27 Eq. 53–54 [19] (VERIFIED):
```
TCF = exp[ 2640 * (1/298 - 1/(273 + T)) ]    for T >= 25 C
TCF = exp[ 3020 * (1/298 - 1/(273 + T)) ]    for T <= 25 C          (T in deg C)
```
- Evaluated values (APPROX):

  | T (°C) | 15 | 20 | 25 | 30 | 35 | 40 | 45 |
  |---|---|---|---|---|---|---|---|
  | TCF | 0.703 | 0.841 | 1.000 | 1.157 | 1.333 | 1.529 | 1.746 |

  The manual's own worked example gives 0.70 at 15 °C.
- The manual also says "a feed temperature drop of 4°C (7°F) will cause a permeate flow decrease of about 10%" [19].
- The WateReuse white paper gives a similar rule of thumb: 1 °C gives "a 3% rate of change (increase/decrease) in membrane throughput" [22] (VERIFIED).

**Salt passage vs temperature.**
- Qualitative statement (VERIFIED [19], §1.5): "If the temperature increases and all other parameters are kept constant, the permeate flux and the salt passage will increase."
- In DuPont's design equations the salt term carries the same TCF: C_p = B·C_fc·pf·TCF·S_E/Q (Eq. 57 and Eq. 71). In effect, B(T) = B₂₅·TCF(T) (VERIFIED).
- **Hydranautics normalization** (VERIFIED, mirror [21]):
  - TCF = exp{K[1/(273 + t) − 1/298]} with K = 2700 K "for composite membrane".
  - Salt passage is normalized with a manufacturer-supplied "Salt Transport TCF". If that is unavailable, use the TCF.
  - That document's TCF is the reciprocal convention of DuPont's (TCF > 1 below 25 °C). Do not mix the two.

### 3e. DuPont design equations

Source: manual Tables 27–29 [19] (VERIFIED). Units are US: psi, gpd, gpm, ppm, ft².
```
Eq.47  Q_i   = A_i(pibar) * S_E * TCF * FF * (P_fi - dP_fci/2 - P_pi - pibar + pi_pi)
Eq.48  pibar = pi_i * (C_fc/C_f) * pf
Eq.49  pi_pi = pi_fi * (1 - R_i)
Eq.50  C_fci/C_fi = 0.5*(1 + C_ci/C_fi)
Eq.51  C_ci/C_fi  = (1 - Y_i*(1 - R_i)) / (1 - Y_i)
Eq.52  pi_f  = 1.12*(273 + T)*sum(m_j)            [psi; m_j = molality of each ion]
Eq.55  pf_i  = exp(0.7*Y_i)
Eq.56  Y     = 1 - prod(1 - Y_i)
Eq.57  C_pj  = B * C_fcj * pf_i * TCF * S_E / Q_i
Eq.67  dP_fc = 0.01 * n * qbar_fc^1.7             [psi; qbar_fc = mean of feed and concentrate flow, gpm; n = elements in series]
Eq.68-70  Abar(pi) = 0.125 (pi <= 25);  0.125 - 0.011*(pi - 25)/35 (25..200);  0.070 - 0.0001*(pi - 200) (200..400)   [gfd/psi, pi in psi]
```

### 3f. Performance normalization

Source: DuPont manual §5.6.6, Eq. 72 and 75–78 [19] (VERIFIED). Subscript s = standard/reference, o = operating.
```
Eq.72  Q_s  = [ (P_fs - dP_s/2 - P_ps - pi_fcs) / (P_fo - dP_o/2 - P_po - pi_fco) ] * (TCF_s/TCF_o) * Q_o
Eq.77  C_fc = C_f * ln(1/(1 - Y)) / Y
Eq.78  C_ps = C_po * [ (P_fo - dP_o/2 - P_po - pi_fco + pi_po) / (P_fs - dP_s/2 - P_ps - pi_fcs + pi_ps) ] * (C_fcs/C_fco)
Eq.75  pi_fc = C_fc*(T + 320)/491000                   [bar]  (C_fc < 20,000 mg/L)
Eq.76  pi_fc = (0.0117*C_fc - 34)/14.23 * (T + 320)/345 [bar]  (intended for C_fc > 20,000 mg/L; manual misprints "<")
```
DuPont's FTNORM Excel tool implements this normalization [19].

### 3g. Cleaning criteria

Source: DuPont manual §6.3 "Cleaning Requirements", p. 135 [19] (VERIFIED, verbatim):

> "Elements should be cleaned when one or more of the below mentioned parameters are applicable:
> - The normalized permeate flow drops 10%
> - The normalized salt passage increases 5 – 10%
> - The normalized pressure drop (feed pressure minus concentrate pressure) increases 10 – 15%"

- The cleaning-procedure section adds: "the 15 psi per element or the 50 psi per multi-element vessel should NOT be used as a cleaning criteria. Cleaning is recommended when the pressure drop increases 15%."
- The manual also notes that some operators accept up to 10 % flux loss from iron fouling before cleaning.
- **Correction to the brief:** the flow trigger is **−10 %**, not 10–15 %. The ΔP trigger is +10–15 %, and salt passage is +5–10 %.

### 3h. Fouling-type troubleshooting pattern

Source: DuPont manual §8.5 and Table 44, p. 169 [19] (VERIFIED).

Legend: ↑ increasing, ↓ decreasing, → not changing; double arrows (⇑ / ⇓) mark the main symptom.

| Direct cause | Permeate flow | Salt passage | ΔP | Indirect cause | Corrective measure |
|---|---|---|---|---|---|
| Oxidation damage | ↑ | ⇑ | → | Free chlorine, ozone, KMnO4 | Replace element |
| Membrane leak | ↑ | ⇑ | → | Permeate backpressure; abrasion | Replace element, improve cartridge filtration |
| O-ring leak | ↑ | ⇑ | → | Improper installation | Replace O-ring |
| Leaking product tube | ↑ | ⇑ | → | Damaged during element loading | Replace element |
| Scaling | ⇓ | ↑ | ↑ | Insufficient scale control | Cleaning, scale control |
| Colloidal fouling | ⇓ | ↑ | ↑ | Insufficient pretreatment | Cleaning, improve pretreatment |
| Biofouling | ↓ | → | ⇑ | Contaminated raw water, insufficient pretreatment | Cleaning, disinfection, improve pretreatment |
| Organic fouling | ⇓ | → | → | Oil; cationic polyelectrolytes | Cleaning, improve pretreatment |
| Compaction | ⇓ | ↓ | → | Water hammer | Replace element or add elements |

**Where each problem shows up** (§8.5.1, pp. 159–162):
- The general rule, quoted: "First stage problem: deposition of particulate matter; initial biofouling. Last stage problem: scaling. Problem in all stages: advanced fouling."
- Biofouling is indicated "predominantly at the front end of the system". The pressure drop "increases sharply when the bacterial fouling is massive".
- "Scaling usually starts in the last stage and then moves gradually to the upstream stages." Also: "Scaling can cause the tail-end differential pressure to increase."
- Diagnostic tip: "Weigh a tail element: scaled elements are heavy."
- Metal-oxide fouling occurs predominantly in the first stage.

---

## 4. ASTM D4516

- **The standard** (VERIFIED on the official store page [23]):
  - ASTM D4516-19a, "Standard Practice for Standardizing Reverse Osmosis Performance Data".
  - Committee D19, Subcommittee D19.08. Active; last updated 26 Nov 2019.
  - DOI 10.1520/D4516-19A; 3 pages; Book of Standards vol. 11.02.
  - URL: https://store.astm.org/d4516-19a.html
- **Scope** (VERIFIED [23]):
  - Quote: "standardization of permeate flow, salt passage, and coefficient of performance data for reverse osmosis (RO) systems".
  - Applies to brackish waters and seawaters, but is "not necessarily applicable to waste waters".
  - Covers spiral-wound and hollow-fibre elements, single- and multi-element systems. SI units.
- **Normalization formula structure.** The standard's text is paywalled, so its exact equations are **UNVERIFIED**.
  - Manufacturer normalizations with the same structure are publicly documented (DuPont Eq. 72/78 in §3f [19]; Hydranautics Eq. 1–8 [21]).
  - Permeate flow is scaled by the ratio of net driving pressures (feed pressure − ½ΔP − permeate pressure − feed-concentrate osmotic pressure [+ permeate osmotic pressure]) and by the ratio of TCFs.
  - Salt passage is scaled by the NDP ratio and the feed-concentrate concentration ratio.
- **Peer-reviewed assessment:** Zhao & Taylor (2005), Desalination 180:231–244, DOI 10.1016/j.desal.2004.11.089 [24] (existence VERIFIED).
  - I did not read the content. A search snippet claims D4516 temperature-corrects water flow but not salt passage; that claim is **UNVERIFIED**.

---

## 5. SWRO energy

### 5a. Thermodynamic minimum

- **Elimelech & Phillip (2011)**, Science 333(6043):712–717, DOI 10.1126/science.1200488 [25]. The DOI is VERIFIED.
  - The widely quoted "1.06 kWh/m³ at 50 % recovery for 35 g/L seawater" could **not** be checked against the paper text (paywalled; the abstract has no numbers). Treat it as **UNVERIFIED** as a direct quote.
- **Independent verified statement** (Biesheuvel et al., arXiv:2110.07506 v6 [26]):
  - E_min = 1.0 kWh/m³ for an ideal 1:1 salt at 525 mM, 50 % water recovery, pure product, 298 K.
  - Including Coulombic and volumetric non-ideality raises it to 1.23 kWh/m³.
  - Single-stage practical minimum: E_min,prac = 2·c_f·R·T/(1 − WR).
- **Our calculation** with the WaterTAP/Sharqawy seawater formulation (APPROX). Conditions: 35 g/kg, 25 °C, reversible process, pure permeate.

  | Recovery r | → 0 | 25 % | 40 % | 50 % |
  |---|---|---|---|---|
  | W_least (kWh/m³) | 0.72 (= π_feed) | 0.83 | 0.93 | **1.01** |

  - A single stage at constant pressure (equal to the exit brine π) needs at least ≈ 1.49 kWh/m³ at 50 % recovery.
  - This agrees with the commonly quoted ~1.06 within property-model differences.
  - Mistry & Lienhard (2013) [27] show least work against recovery only graphically (Fig. 3).

### 5b. Whole-plant specific energy consumption and its breakdown

- **Typical ranges** (VERIFIED in [30], which is secondary for Voutchkov):
  - Quote: "SWRO desalination needs between 3.5 and 4.5 kWh m⁻³ to produce product water (Kim and Hong, 2018; Voutchkov, 2018)."
  - For comparison: conventional surface-water treatment 0.2–0.4 kWh/m³; indirect potable reuse 1.5–2.0 kWh/m³.
  - The RO system, including membranes and HP pumps, is "~65% of SEC".
  - SEC overall ranges 3–6.7 kWh/m³. HP pumps typically deliver 55–70 bar.
- **Arabian Gulf** (VERIFIED [31]), quoted: "SWRO requires about 3 kWhe m⁻³ for the Mediterranean Sea, Atlantic and Pacific oceans, and 4 kWhe m⁻³ for the Arabian Gulf including pre- and post-treatment."
- **Stage breakdown** (VERIFIED [22]). Source: WateReuse Association Desalination Committee white paper, Nov 2011, US context.

  | Stage | Energy or share | Notes |
  |---|---|---|
  | Intake | 15–20 % of total treatment-process power | conventional intake close to the plant |
  | Pretreatment | 0.9–1.5 kWh/kgal (0.24–0.40 kWh/m³); 8–12 % of total | |
  | SWRO incl. energy recovery | 6.8–8.2 kWh/kgal (1.80–2.17 kWh/m³); 65–85 % of total energy cost | ADC 2008 tests; excludes conveyance and distribution |
  | Post-treatment conditioning | < 2 % of total | |
  | Ancillary / support | 10–15 % of total power | buildings, cleaning systems, etc. |

  - The paper adds that in the Middle East, net energy runs 15–20 % above the US values because of higher salinity.
- **Voutchkov (2018)**, Desalination 431:2–14, DOI 10.1016/j.desal.2017.10.033 [28]. The DOI is VERIFIED, but I could not access its breakdown table, so those numbers are **UNVERIFIED**.
- **Kim, Park, Yang & Hong (2019)**, Applied Energy 254:113652, DOI 10.1016/j.apenergy.2019.113652 [29]. DOI and abstract are VERIFIED.
  - The abstract describes more than 70 datasets on large SWRO plants.
  - It says: "High salinity increases energy demand, whereas the temperature effect on energy consumption is not entirely clear."

### 5c. Pumps and energy-recovery devices

- **HP pump and motor efficiency.** I found no primary source for a "typical" value, so it is **UNVERIFIED**. The WaterTAP SWRO examples use a single lumped pump efficiency of 0.80 [12]; treat that as a model default.
- **ERD efficiencies** (VERIFIED in [30], citing Kim et al. 2019 and Urrea et al. 2019):
  - Turbine 75 %, turbocharger 80 %, Pelton wheel 85 %, isobaric devices 95–97 %.
  - Plant SEC with PX devices ranges 3.0–5.3 kWh/m³.
  - ERDs save 25–40 %.
  - ERI adds that turbochargers and Pelton turbines peak "at around 80%" [32].

**Energy Recovery Inc. PX, white paper of January 2025** [32] (VERIFIED):
```
Efficiency           = sum(Pressure x Flow)_OUT / sum(Pressure x Flow)_IN x 100 %
Volumetric mixing    = (HPin_TDS - HPout_TDS) / (HPin_TDS - LPin_TDS) x 100
Salinity increase    = (membrane feed salinity - system feedwater salinity) / system feedwater salinity x 100
```
- "Up to 98%" efficiency. In testing, both the PX Q300 and Q400 reach a maximum of 98.1 % at minimum flow. At maximum rated flow the figures are 96.5 % (Q300) and 97.3 % (Q400).
- Volumetric mixing is "less than 3% at balanced flow" for the Q400 and "about 5%" for the Q300.
- Lead flow (LP flow greater than HP flow) lowers the salinity at the HP outlet; lag flow raises it.

Projected performance for one case: a 250 MLD plant (10 trains of 25,000 m³/d), 42 % recovery, feed 42,000 mg/L at 28 °C.

| Metric | PX Q300 | PX Q400 |
|---|---|---|
| Salinity increase at membrane | 2.18 % | 1.29 % |
| Volumetric mixing | 5.02 % | 3.02 % |
| Lubrication flow, % of concentrate | 0.91 % | 1.17 % |
| HP-side ΔP | 1.02 bar | 0.67 bar |
| LP-side ΔP | 1.04 bar | 0.62 bar |
| Brine recovery efficiency | 97.32 % | 97.66 % |
| Overall PX efficiency | 95.69 % | 96.70 % |
| Membrane feed pressure | 58.09 bar | 57.53 bar |
| RO SEC, HP section only | 2.11 kWh/m³ | 2.08 kWh/m³ |
| RO SEC, including LP feed pump | 2.27 kWh/m³ | 2.22 kWh/m³ |

- The same system with a turbocharger instead of a PX would need about 2.72 kWh/m³.
- The white paper's §5.1 text mistypes the two membrane-feed salinities; the table values are used above.
- **Field evidence of ERD mixing:** at the Al-Jubail pilot, pretreated seawater averaged 43,800 mg/L while the RO feed was 45,484 mg/L, "due to mixing of the brine water from brine ERD". That is +3.8 % [35] (VERIFIED).
- **Stover (2007)**, Desalination 203:168–175, DOI 10.1016/j.desal.2006.03.528 [33]. The DOI is VERIFIED; I did not access the content.

---

## 6. Arabian Gulf and UAE context

### 6a. Salinity and temperature

**Salinity** (all VERIFIED):
- Quote: "Salinity of >39 psu occurs in most Gulf waters." Poorly flushed embayments such as the Gulf of Salwah exceed 70 psu [34].
- DuPont manual Table 7: Bahrain seawater 42,500 ppm TDS and 59,350 µS/cm. For comparison, the Red Sea (Egypt) is 44,000 ppm and the Mediterranean (Sardinia) 40,800 ppm [19].
- Al-Jubail pilot on the Saudi Gulf coast: DMF-treated seawater averaged 43,800 mg/L [35].

**Temperature** (all VERIFIED):
- Sheppard et al. (2010), Table 1, gives temperature extremes on Arabian coral reefs and limestone platforms [34]:

  | Location | Min (°C) | Max (°C) | Original source |
  |---|---|---|---|
  | Abu Dhabi | 16.0 | 36.0 | Kinsman 1964 |
  | Qatar | 14.1 | 36 | Shinn 1976 |
  | Saudi Arabia (27°N) | 11.4 | 36.2 | Coles & Fadlallah 1991 |
  | Kuwait | 13.2 | 31.5 | Downing 1985 |

- Al-Jubail pilot: raw water ranged 14.0–37.9 °C, with the minimum on 4 Feb and the maximum on 13 Aug. RO feed ran 16.2–39.3 °C, about 2 °C above raw water because of HP-pump waste heat [35].

**Scenario ranges for AquaTwin** (APPROX synthesis): S ≈ 40–46 g/kg and T ≈ 16–36 °C (up to ~38 °C) are defensible with these citations. Lower salinity on the UAE east coast (Gulf of Oman) was not verified here (**UNVERIFIED**).

### 6b. The 2008–2009 harmful algal bloom

- **Sheppard et al. (2010)** [34] (VERIFIED): HABs with massive fish kills were reported from Abu Dhabi, Dubai, Ajman, Fujairah, Iran and Oman from August 2008 to May 2009. The main species was *Cochlodinium polykrikoides*.
- **Richlen et al. (2010)**, Harmful Algae 9:163–172, DOI 10.1016/j.hal.2009.08.013 [36]. The DOI is VERIFIED. Wording from the abstract (bloom lasting "more than eight months", "closure of desalination plants") was seen only in search snippets, so it is **UNVERIFIED** as a quote.
- **IOC-UNESCO Manuals and Guides 78** (Anderson, Boerlage & Dixon, eds., 2017), Chapter 2 by Hess et al. [38] (VERIFIED):
  - p. 58: "Clogging of granular media filters (GMF the most widely used SWRO pretreatment technique) was one of the identified causes of SWRO plant shutdown during the severe HAB in the Gulf of Oman in 2008-2009 (Richlen et al. 2010; Berktay 2011) due to severely reduced operation times from 24 hours to 2 hours."
  - p. 63: "At Fujairah 1 in the UAE, the MSF plants continued to operate without issue while the SWRO desalination plant had to be shut down for more than one week. A minor shut down of thermal desalination plants did occur in Sharjah, UAE (less than 24 hours) due to odor issues associated with the product water."
- A claim of "SWRO shutdowns lasting up to four months" appeared only in a search-engine summary attributed to IOC material (**UNVERIFIED**).
- **Berktay, A. (2011)**, "Environmental approach and influence of red tide to desalination process in the Middle-East region", International Journal of Chemical and Environmental Engineering 2(3):183–188. This is the reference as listed in IOC Manual 78. No DOI was found and I did not access it (**UNVERIFIED** content).
- **Renamed species:** *C. polykrikoides* was moved to *Margalefidinium* by Gómez, Richlen & Anderson (2017), Harmful Algae 63:32–44, DOI 10.1016/j.hal.2017.01.008 [37] (title verified).

### 6c. UAE water supply

**From the official portal u.ae** (VERIFIED):
- Water page, updated 08 Sep 2026 [40]:
  - "As per Ministry of Energy and Infrastructure (MOEI), the UAE's total water demand is estimated at 5 billion cubic metres per year."
  - Groundwater accounts for "around 46 per cent of the country's water supply and 93 per cent of the irrigation water".
  - "Desalination is a key source of water in the UAE, particularly for drinking and domestic use."
  - Installed desalination capacity in 2023 was 7.8 million m³/day in total (source: FCSC):

    | Entity | Capacity (million m³/day) |
    |---|---|
    | DoE Abu Dhabi | 4.74 |
    | DEWA | 2.25 |
    | SEWGA | 0.56 |
    | EtihadWE | 0.20 |
    | **Total** | **7.8** |

  - The same page counts 46 desalination plants as of 2015.
- SDG 6 page, updated 30 Dec 2024 [41], quoted: "The UAE produces annually 2.52 billion cubic metres of underground water consumed mainly in the agriculture sector, 2.02 billion cubic metres of desalinated seawater consumed by the urban sector, and 0.53 billion cubic metres of treated wastewater". It cites the UAE State of Environment report 2020.
  - That puts desalination at **≈ 40 % of total production** (APPROX, our arithmetic: 2.02/5.07).

**Share of domestic and drinking water** (APPROX): "96 per cent of domestic consumption of water – from drinking water to showers – comes from one of the 70 desalination plants". The National attributes this to MOCCAE in an article of 2 Feb 2017 [42]. It is a news source and was not confirmed on a current official page.

**Taweelah IWP**, from ACWA Power's official project page [43] (VERIFIED):
- "200 MIGD via reverse osmosis (909,201 m3/day)", at Taweelah, Abu Dhabi.
- Commercial operation Q1 2024.
- ACWA Power holds 40 %; Mubadala and TAQA are co-investors.

Other RO projects listed on u.ae [40]: DEWA's Hassyan SWRO, up to 180 MIGD with all phases due in Q1 2027; and EtihadWE's Fujairah I IWP, 60 MIGD SWRO.

**UAE Water Security Strategy 2036**, u.ae page updated 25 Aug 2026 [39] (VERIFIED targets):
- Reduce total demand for water resources by 21 %.
- Raise the water productivity index to USD 110 per m³.
- Reduce the water scarcity index by 3 degrees.
- Raise reuse of treated water to 95 %.
- Raise national water storage capacity to up to 2 days.

The strategy page does not state the launch year or ministry. MOEI is referenced on the u.ae water page, but the launch date is **UNVERIFIED**.

---

## 7. Product water quality

### 7a. WHO Guidelines for Drinking-water Quality

Edition: 4th edition incorporating the 1st and 2nd addenda (2022), ISBN 978-92-4-004506-4 [44].

**TDS palatability**, §10 (acceptability aspects), p. 246 (VERIFIED, verbatim):
> "The palatability of water with a total dissolved solids (TDS) level of less than about 600 mg/l is generally considered to be good; drinking-water becomes significantly and increasingly unpalatable at TDS levels greater than about 1000 mg/l. … No health-based guideline value for TDS has been proposed."

**Boron**, Chapter 12 fact sheet, pp. 350–351 (VERIFIED):
- "Guideline value 2.4 mg/l (2400 µg/l)". TDI 0.17 mg/kg body weight; assessment date 2009.
- Quote: "Because it will be difficult to achieve the guideline value of 2.4 mg/l in some desalinated supplies and in areas with high natural boron levels, local regulatory and health authorities should consider a value in excess of 2.4 mg/l by assessing exposure from other sources."
- p. 102: "Where membranes are used, boron and some smaller molecular weight organic substances may not be excluded, so it is important to establish the membrane capability."

### 7b. WHO, *Safe drinking-water from desalination* (2011)

Document WHO/HSE/WSH/11.03 [45] (VERIFIED):
- Boron "is not well removed by reverse osmosis (RO)".
- Some plants are sensitive to boron at 0.5 mg/L in irrigation water.

### 7c. Typical single-pass SWRO permeate TDS

No authoritative general range was verified.
- **Pilot data point:** the ADC pilot produced 156 mg/L TDS and 0.8 mg/L boron. Conditions: feed 31,742 mg/L, 48 % recovery, 60 °F, 9.0 gfd, 885 psi [22] (VERIFIED).
- **Element level:** 99.8 % rejection at 32,000 ppm gives about 64 mg/L at the 8 %-recovery test condition (APPROX, our arithmetic).
- The commonly quoted "~100–500 mg/L" range is **UNVERIFIED**.

---

## 8. Grid carbon intensity (UAE)

- **Ember (2026), via Our World in Data**, "Lifecycle carbon intensity of electricity generation" [46] (VERIFIED):
  - **UAE 2024 = 467.51 gCO₂e/kWh ≈ 0.468 kg CO₂e/kWh.**
  - Lifecycle basis: includes upstream and supply chain, and covers all greenhouse gases.
  - 2024 is the latest actual year; OWID carries it forward into the 2025 view. Dataset last updated 2026-06-30.
  - Series for trend analysis:

    | Year | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
    |---|---|---|---|---|---|---|
    | UAE (gCO₂e/kWh) | 660.09 | 645.69 | 605.30 | 558.49 | 483.79 | 467.51 |

  - World average for 2024: 471.08 gCO₂e/kWh.
- **Ember UAE country page**, updated 22 Apr 2026 [46]: 32 % clean, 9 % wind and solar, 68 % fossil. The year was not shown in the page summary (APPROX).
- **IEA emission factors** (direct CO₂) are a paid data product; not accessed (**UNVERIFIED**).
- **DEWA grid factor:** the page blocked automated access (**UNVERIFIED**).
- **Basis matters:** lifecycle factors are higher than direct-combustion factors. State which basis you use.

---

## 9. Hybrid modelling, ML and uncertainty references

All DOIs and URLs below were verified via Crossref, arXiv or the official pages.

### 9a. Physics-guided ML
- **Willard, Jia, Xu, Steinbach & Kumar**, "Integrating Scientific Knowledge with Machine Learning for Engineering and Environmental Systems", ACM Computing Surveys 55(4):1–37, DOI 10.1145/3514228 [47].
  - Crossref gives the issue date as 30 Apr 2023. The paper is commonly cited as 2022.
- **Karpatne et al. (2017)**, "Theory-Guided Data Science: A New Paradigm for Scientific Discovery from Data", IEEE TKDE 29(10):2318–2331, DOI 10.1109/TKDE.2017.2720168 [48].

### 9b. Uncertainty and out-of-distribution detection
- **Angelopoulos & Bates**, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification", arXiv:2107.07511 (v1 July 2021).
  - Published as "Conformal Prediction: A Gentle Introduction", Foundations and Trends in Machine Learning 16(4):494–591 (2023), DOI 10.1561/2200000101 [49].
- **Lee, Lee, Lee & Shin (2018)**, "A Simple Unified Framework for Detecting Out-of-Distribution Samples and Adversarial Attacks", Advances in NeurIPS 31. This is the Mahalanobis-distance OOD detector. Also arXiv:1807.03888 [52].

### 9c. Software
- **scikit-learn `HistGradientBoostingRegressor`** (docs v1.9.1): https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html [51].
  - The docs describe it as a "Histogram-based Gradient Boosting Regression Tree … much faster than GradientBoostingRegressor for big datasets (n_samples >= 10 000). This estimator has native support for missing values (NaNs)."
  - It is "inspired by LightGBM". The `loss` options include `'quantile'`, which is useful for prediction intervals.
- **Pedregosa et al. (2011)**, "Scikit-learn: Machine Learning in Python", JMLR 12:2825–2830, https://jmlr.org/papers/v12/pedregosa11a.html [50].

### 9d. Digital twins in water
- **Reviews:**
  - Ghorbani Bam et al. (2025), "Digital Twin Applications in the Water Sector: A Review", Water 17(20):2957, DOI 10.3390/w17202957 [53]. Open access. The abstract covers treatment, networks, and reuse, as well as the water–energy nexus.
  - Wang et al. (2024), "Digital Twins for Wastewater Treatment: A Technical Review", Engineering 36:21–35, DOI 10.1016/j.eng.2024.04.012 [54].
  - Torfs et al. (2022), "The transition of WRRF models to digital twin applications", Water Science & Technology 85(10):2840–2853, DOI 10.2166/wst.2022.107 [55].
  - Pedersen et al. (2021), "Living and Prototyping Digital Twins for Urban Water Systems…", Water 13(5):592, DOI 10.3390/w13050592 [56].
- **Desalination application:** Cuba, Avila, Quiza & Marichal (2025), "Digital twin to optimise the cost of electricity consumed by a water desalination plant under a time-based tariff", Water Reuse 15(3):509–527, DOI 10.2166/wrd.2025.039 [57].
  - Abstract: a digital twin of an RO plant with data-fitted, periodically updated models of permeate flow and electricity use against pressure, optimized hour by hour with a genetic algorithm under time-of-use tariffs.

### 9e. ML for RO fouling and performance
- Roehl et al. (2018), "Modeling fouling in a large RO system with artificial neural networks", J. Membr. Sci. 552:95–106, DOI 10.1016/j.memsci.2018.01.064 [58].
- Park et al. (2019), "Deep neural networks for modeling fouling growth and flux decline during NF/RO membrane filtration", J. Membr. Sci. 587:117164, DOI 10.1016/j.memsci.2019.06.004 [59].
- Jawad, Hawari & Zaidi (2021), "Artificial neural network modeling of wastewater treatment and desalination using membrane processes: A review", Chem. Eng. J. 419:129540, DOI 10.1016/j.cej.2021.129540 [60].
- Aish, Zaqoot & Abdeljawad (2015), "Artificial neural network approach for predicting reverse osmosis desalination plants performance in the Gaza Strip", Desalination 367:240–247, DOI 10.1016/j.desal.2015.04.008 [61].

---

## 10. Khalifa University–UNESCO Global Water Hackathon 2026

**Official sources** (all VERIFIED): KU news of 27 Aug 2026 [62]; KU news of 24 Sep 2026 [63]; the program page https://ku.events/global_water_hackathon_2026/ [64]; the Hackathon Guidelines PDF (4 pp., created 22 Aug 2026) [65]; and the registration page [66].

**Organizer.** KU Center for Membranes and Advanced Water Technology (CMAT), with UNESCO and Youth4Water (a UNESCO flagship initiative). Chair: Prof. Shadi W. Hasan.
- The finals are held during the 2026 UN Water Conference in Abu Dhabi, 8–10 Dec 2026, co-hosted by the UAE and Senegal.

**Timeline** (program page [64]):

| Phase | Date | Mode |
|---|---|---|
| Registration deadline | 07 Sep 2026 | |
| Problem framing, solution development, validation and technical review | deadline 31 Oct 2026 | online |
| **Final Submission Deadline** | **01 Nov 2026** | online |
| Jury decision on finalists | 06 Nov 2026 | |
| Pitching and awards | 8–10 Dec 2026 | onsite, Abu Dhabi |

- The KU article of 24 Sep says the hackathon "runs from 7 September to 10 December 2026" [63].
- **Conflict:** the apps.ku.ac.ae registration page says "registration deadline was 7 July 2026" [66], which disagrees with the program page's 07 Sep 2026.

**Themes** (guidelines [65]). There are six, each mapped to UN Water pillars:

| # | Theme | Indicative focus areas |
|---|---|---|
| 1 | Water Security and Sustainable Desalination | low-energy and hybrid desalination concepts; system-level optimization to reduce energy use and emissions; brine management and resource recovery; comparative cost, energy and environmental performance assessments |
| 2 | Water Reuse, Circularity and Resource Efficiency | |
| 3 | **Smart, Digital, and AI-Enabled Water Systems** (pillars: Prosperity, Planet, Cooperation) | AI-driven leak detection and demand forecasting; smart sensing and real-time monitoring; "Digital twins and decision-support tools for utilities and regulators" |
| 4 | Water Quality, Health and Environmental Protection | |
| 5 | Energy–Water Nexus and Climate Resilience | includes energy recovery and thermal integration strategies |
| 6 | Integrated Water Systems, Governance and Cooperation | |

**Team composition.** 4–5 students.
- The guidelines [65] add 1–2 faculty advisors and 1–2 industry mentors.
- The program page [64] instead says 1–2 academic mentors and 1 industry expert.

**Expected outputs** (KU, 27 Aug [62]), quoted: "Outputs may include validated technical concepts, prototypes, simulation models, AI tools and digital decision-support platforms, accompanied by a technical report, UN-aligned impact and policy brief, industry-adoption roadmap and final pitch."

**Evaluation criteria** (guidelines [65] and program page [64]):

| Criterion | Weight |
|---|---|
| Scientific and technical rigor | **30 %** |
| Alignment with UN Water pillars | **20 %** |
| Feasibility and scalability | **20 %** |
| Industry relevance and adoption potential | **15 %** |
| Quality of communication and presentation | **15 %** |

- Judging runs in tiers: technical review panels, then a UN and policy relevance panel, then a grand jury.

**Prizes:**
- Grand Prize (KU–UN Water Innovation Award): 50,000 AED.
- Six Best Theme Awards: 30,000 AED each.
- Three Strategic Recognition Awards at 20,000 AED each: UAE Water Impact, Climate & Planet Impact, and Industry Choice.
- The total is about 290,000 AED.

**Not found in any public official source (UNVERIFIED):**
- final report page limit, format or template
- demo video length or format
- prototype submission format
- submission portal

Ask the CMAT program contacts listed on the program page, or check the participant emails and portal.

---

## Parameter table for the simulator

| Parameter | Value | Unit | Source ref | Confidence |
|---|---|---|---|---|
| MW_TDS (mean molar mass of sea-salt solutes) | 31.4038218e-3 | kg/mol | [1], [5] | verified |
| Osmotic coefficient φ(t,S), Sharqawy eq. 49, a1..a10 | 0.89453, 4.1561e-4, −4.6262e-6, 2.2211e-11, −0.11445, −1.4783e-3, −1.3526e-8, 7.0132, 5.696e-2, −2.8624e-4 | t °C, S kg/kg | [1], [3] | verified |
| φ validity | 0–200 °C; 10–120 g/kg; ±1.4 % | – | [3] | verified |
| Osmotic pressure form | π = φ·m_TDS·ρ_w·R·T (no factor 2) | Pa | [1], [2], [4] | verified |
| Pure-water density A1..A5 (eq. 8) | 999.9; 2.034e-2; −6.162e-3; 2.261e-5; −4.657e-8 | kg/m³ | [1], [3] | verified |
| Seawater density B1..B5 (eq. 8) | 802.0; −2.001; 1.677e-2; −3.060e-5; −1.613e-5 | kg/m³ | [1], [3] | verified |
| Gas constant R | 8.314 | J mol⁻¹ K⁻¹ | [2] | verified |
| π at 35 g/kg, 25 °C | 25.9 (TEOS-10 example: 25.65 bar at 35.03 g/kg, 22.8 °C) | bar | [1] calc; [8] | approximate (TEOS-10 agrees within ±0.4 %) |
| π at 45 g/kg, 25 °C | 33.8 | bar | calc from [1] | approximate |
| π, DuPont approximation (C > 20 g/L) | (0.0117·C − 34)/14.23·(T + 320)/345 | bar (C mg/L) | [19] | verified |
| μ_sw at 35 g/kg, 25 °C | 0.959 | mPa·s | calc from [1], [3] | approximate |
| D (NaCl stand-in, 25 °C, w = 0.035) | 1.47e-9 | m²/s | calc from [1], [6] | approximate |
| A (WaterTAP SWRO example) | 4.2e-12 (= 1.512 LMH/bar) | m s⁻¹ Pa⁻¹ | [12] | verified |
| B (WaterTAP SWRO example) | 3.5e-8 (= 0.126 LMH) | m s⁻¹ | [12] | verified |
| A, SW30HRLE-440i derived | ≈ 3.2e-12 (1.16 LMH/bar) | m s⁻¹ Pa⁻¹ | [15] + our calc | approximate |
| A, SW30XLE-440i derived | ≈ 4.0e-12 (1.44 LMH/bar) | m s⁻¹ Pa⁻¹ | [16] + our calc | approximate |
| B, SW30HRLE-440i derived | ≈ 1.55e-8 (0.056 LMH) | m/s | [15] + our calc | approximate |
| B, SW30XLE-440i derived | ≈ 1.9e-8 (0.069 LMH) | m/s | [16] + our calc | approximate |
| Water density in flux equation | 1000 (fixed) | kg/m³ | [11] | verified |
| Sherwood correlation | Sh = 0.46(Re·Sc)^0.36 | – | [10], [11] | verified as the WaterTAP model; original attribution unverified |
| Friction factor, spiral wound | f = 6.23·Re^−0.3 | – | [11], [14] | verified |
| Friction factor, flat sheet | f = 0.42 + 189.3/Re | – | [11] | verified |
| Hydraulic diameter | d_h = 4ε/(2/h + (1 − ε)·8/h) | m | [11] | verified |
| Feed channel height | 1e-3 | m | [12] | verified (WaterTAP example) |
| Spacer porosity | 0.85 (0.9 in the second flowsheet) | – | [12] | verified (WaterTAP example) |
| Element active area (440i) | 41 | m² | [15], [16] | verified |
| Element nominal permeate flow | 30.2 (HRLE) / 37.5 (XLE) | m³/d | [15], [16] | verified |
| Element test conditions | 32,000 ppm NaCl, 55 bar, 25 °C, 8 % recovery, pH 8, 5 ppm B | – | [15], [16] | verified |
| Stabilized / minimum salt rejection | 99.80 / 99.65 (HRLE); 99.8 / 99.6 (XLE) | % | [15], [16] | verified |
| Boron rejection | 92 (HRLE) / 91.5 (XLE) | % | [15], [16] | verified |
| Max feed pressure | 83 | bar | [15], [16] | verified |
| Max feed temperature | 45 (35 if pH > 10) | °C | [15], [16] | verified |
| Max ΔP per element | 1.0 | bar | [15], [18] | verified |
| Max ΔP per vessel | 3.5 (datasheet) / 3.4 (usage guide) | bar | [15], [18] | verified |
| Max feed flow per vessel, SW 400 ft² (SDI < 2.5 / < 3 / < 5) | 16 / 15 / 14 | m³/h | [17] | verified (no 440 ft² row) |
| Min concentrate flow per vessel, SW (SDI < 2.5 / < 3 / < 5) | 3.0 / 3.2 / 3.4 | m³/h | [17] | verified |
| Max element recovery, SW (SDI < 2.5 / < 3 / < 5) | 15 / 14 / 13 | % | [17] | verified |
| Design average flux, SW (SDI < 2.5 / < 3 / < 5) | 15–19 / 14–17 / 12–17 | LMH | [17] | verified |
| Max element flux, SW (SDI < 2.5 / < 3 / < 5) | 36 / 34 / 32 | LMH | [17] | verified |
| CP factor (DuPont) | pf = exp(0.7·Y_i) | – | [19] | verified |
| CPF limit (Hydranautics) | 1.20 (≈ 18 % element recovery) | – | [20] | verified (mirror document) |
| TCF constant, T ≥ 25 °C | 2640 | K | [19] | verified |
| TCF constant, T ≤ 25 °C | 3020 | K | [19] | verified |
| Salt passage temperature scaling | B(T) = B₂₅·TCF(T) (DuPont Eq. 57/71) | – | [19] | verified |
| Concentrate-side ΔP (empirical) | ΔP_fc = 0.01·n·q̄^1.7 | psi (q̄ in gpm) | [19] | verified |
| Cleaning trigger: normalized permeate flow | −10 | % | [19] | verified |
| Cleaning trigger: normalized salt passage | +5 to +10 | % | [19] | verified |
| Cleaning trigger: normalized ΔP | +10 to +15 (procedure text says +15) | % | [19] | verified |
| HP pump efficiency | 0.80 | – | [12] | verified as the WaterTAP default; "typical" value unverified |
| PX efficiency | 0.95 (WaterTAP); 0.957–0.967 overall and up to 0.98 (ERI) | – | [12], [32] | verified |
| PX volumetric mixing | 3 (Q400) – 5 (Q300) | % | [32] | verified |
| Membrane feed salinity increase due to PX | 1.3–2.2 (field: +3.8 at Al-Jubail) | % | [32], [35] | verified |
| PX lubrication flow | 0.9–1.2 % of concentrate | % | [32] | verified |
| PX pressure drop, HP / LP side | 0.67–1.02 / 0.62–1.04 | bar | [32] | verified |
| Operating-pressure initial guess | P = OPF·π_brine (OPF 1.15 default; 1.3 in the example) | – | [12] | verified |
| RO SEC (HP section) at 42 g/L, 28 °C, 42 % recovery | 2.08–2.11 (2.22–2.27 with feed pump) | kWh/m³ | [32] | verified (vendor projection) |
| Whole-plant SEC, typical | 3.5–4.5 | kWh/m³ | [30] | verified (secondary) |
| Whole-plant SEC, Arabian Gulf | ≈ 4 | kWh/m³ | [31] | verified |
| RO share of plant SEC | ≈ 65 (range 65–85) | % | [30], [22] | verified |
| Pretreatment energy | 0.24–0.40 (8–12 %) | kWh/m³ | [22] | verified (US, 2011) |
| Intake energy share | 15–20 | % | [22] | verified (US, 2011) |
| Post-treatment energy share | < 2 | % | [22] | verified (US, 2011) |
| Ancillary energy share | 10–15 | % | [22] | verified (US, 2011) |
| Least work, 35 g/kg, 25 °C, 50 % recovery | 1.01 (ours); 1.06 (Elimelech & Phillip) | kWh/m³ | calc; [25] | approximate / unverified |
| Least work, recovery → 0 | 0.72 | kWh/m³ | calc | approximate |
| Gulf feed salinity | > 39 psu (most of Gulf); 42.5 g/L Bahrain; 43.8 g/L Al-Jubail | g/kg or g/L | [34], [19], [35] | verified |
| Gulf / UAE feed temperature | 16.0–36.0 (Abu Dhabi nearshore); 14.0–37.9 (Al-Jubail intake) | °C | [34], [35] | verified |
| UAE grid carbon intensity, 2024, lifecycle | 0.468 | kg CO₂e/kWh | [46] | verified |
| WHO TDS palatability thresholds | < ~600 good; > ~1000 increasingly unpalatable | mg/L | [44] | verified |
| WHO boron guideline value | 2.4 | mg/L | [44] | verified |
| Hackathon final submission deadline | 01 Nov 2026 | – | [64] | verified |

---

## Not verified / open items

- **Thermodynamic minimum:** "1.06 kWh/m³" in Elimelech & Phillip (2011) is paywalled. Use our computed 1.01 kWh/m³ or the arXiv value (1.0 kWh/m³ ideal) with citation.
- **Voutchkov (2018) stage breakdown:** paywalled. The breakdown above comes from WateReuse (2011) and Frontiers (2020).
- **HP pump and motor efficiency:** no primary source found for "typical" values.
- **Stover (2007) content:** not accessed. ERI's 2025 white paper is used for PX efficiency and mixing instead.
- **ASTM D4516 exact equations:** the standard is paywalled.
- **Sherwood correlation origin:** attributing Sh = 0.46(Re·Sc)^0.36 to Guillen & Hoek (2009) is unverified.
- **DuPont 440 ft² SW feed-flow limit:** not in the Rev 14 table.
- **HAB details:** "shutdowns up to four months" and the exact wording of the Richlen et al. abstract; the content of Berktay (2011).
- **Official UAE drinking-water share:** only the 2017 news quote (96 %) was found.
- **Strategy 2036 launch date:** not stated on the official page.
- **Grid factors:** IEA (direct CO₂) and DEWA values were not accessed.
- **Hackathon deliverable formats:** report length and format, video length and format, and prototype submission requirements are not published in the public official documents. There is also a registration-date conflict (7 July vs 7 Sep).

---

## Reference list

All entries below were verified to exist, via Crossref, the publisher or official page, or the document itself. Notes in parentheses say how much of the content was accessed.

1. watertap-org. `watertap/property_models/seawater_prop_pack.py` (main; file commit 5bfe7940ba, 2026-08-27). GitHub. https://github.com/watertap-org/watertap/blob/main/watertap/property_models/seawater_prop_pack.py
2. WaterTAP documentation. "Seawater Property Package". https://watertap.readthedocs.io/en/latest/technical_reference/property_models/seawater.html
3. Sharqawy, M.H., Lienhard V, J.H., Zubair, S.M. (2010). Thermophysical properties of seawater: a review of existing correlations and data. *Desalination and Water Treatment* 16(1–3):354–380. https://doi.org/10.5004/dwt.2010.1079. Open copy with errata: https://web.mit.edu/lienhard/www/papers/journal/Thermophysical_properties_of_seawater-DWT-16-354-2010.pdf
4. Nayar, K.G., Sharqawy, M.H., Banchik, L.D., Lienhard V, J.H. (2016). Thermophysical properties of seawater: A review and new correlations that include pressure dependence. *Desalination* 390:1–24. https://doi.org/10.1016/j.desal.2016.02.024. Preprint: http://hdl.handle.net/1721.1/106794
5. Millero, F.J., Feistel, R., Wright, D.G., McDougall, T.J. (2008). The composition of Standard Seawater and the definition of the Reference-Composition Salinity Scale. *Deep-Sea Research Part I* 55(1):50–72. https://doi.org/10.1016/j.dsr.2007.10.001 (existence verified; used via [1]).
6. Bartholomew, T.V., Mauter, M.S. (2019). Computational framework for modeling membrane processes without process and solution property simplifications. *Journal of Membrane Science* 573:682–693. https://doi.org/10.1016/j.memsci.2018.11.067 (existence verified; used via [1], [9]).
7. IOC, SCOR, IAPSO (2010). *The international thermodynamic equation of seawater – 2010: Calculation and use of thermodynamic properties*. Intergovernmental Oceanographic Commission, Manuals and Guides No. 56, UNESCO, 196 pp. https://www.teos-10.org/pubs/TEOS-10_Manual.pdf
8. TEOS-10 GSW documentation. `gsw_osmotic_pressure_t_exact`. https://www.teos-10.org/pubs/gsw/html/gsw_osmotic_pressure_t_exact.html
9. watertap-org. `watertap/property_models/NaCl_prop_pack.py` (main). https://github.com/watertap-org/watertap/blob/main/watertap/property_models/NaCl_prop_pack.py
10. WaterTAP documentation. "Reverse Osmosis (0D)" and "Reverse Osmosis (1D)". https://watertap.readthedocs.io/en/latest/technical_reference/unit_models/reverse_osmosis_0D.html and https://watertap.readthedocs.io/en/latest/technical_reference/unit_models/reverse_osmosis_1D.html
11. watertap-org. `watertap/unit_models/reverse_osmosis_base.py` and `watertap/core/membrane_channel_base.py` (main). https://github.com/watertap-org/watertap/blob/main/watertap/unit_models/reverse_osmosis_base.py and https://github.com/watertap-org/watertap/blob/main/watertap/core/membrane_channel_base.py
12. watertap-org. Flowsheets `RO_with_energy_recovery/RO_with_energy_recovery.py` and `seawater_RO_desalination/seawater_RO_desalination.py`, and `watertap/core/util/unit_models.py` (main). https://github.com/watertap-org/watertap/tree/main/watertap/flowsheets
13. Guillen, G., Hoek, E.M.V. (2009). Modeling the impacts of feed spacer geometry on reverse osmosis and nanofiltration processes. *Chemical Engineering Journal* 149:221–231. https://doi.org/10.1016/j.cej.2008.10.030 (existence only; content not accessed).
14. Schock, G., Miquel, A. (1987). Mass transfer and pressure loss in spiral wound modules. *Desalination* 64:339–352. https://doi.org/10.1016/0011-9164(87)90107-X (existence only; cited in WaterTAP code).
15. DuPont (2024). FilmTec™ SW30HRLE-440i Element, Product Data Sheet, Form No. 45-D00965-en, Rev. 5, Nov 2024. https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-FilmTec-SW30HRLE-440i-PDS-45-D00965-en.pdf
16. DuPont (2026). FilmTec™ SW30XLE-440i Element, Product Data Sheet, Form No. 45-D00974-en, Rev. 7, Jan 2026. https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-FilmTec-SW30XLE-440i-PDS-45-D00974-en.pdf
17. DuPont (2026). Membrane System Design Guidelines for 8-inch FilmTec™ Elements, Form No. 45-D01695-en, Rev 14, Feb 2026. https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-NF-FilmTec-Membrane-Sys-Design-Guidelines-8inch-Manual-Exc-45-D01695-en.pdf
18. DuPont (2025). Usage Guidelines for FilmTec™ 8" Elements, Tech Fact, Form No. 45-D01706-en, Rev 4, Jun 2025. https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-FilmTec-8-Usage-Guidelines-TechFact-45-D01706-en.pdf
19. DuPont (2026). FilmTec™ Reverse Osmosis Membranes Technical Manual, Form No. 45-D01504-en, Rev. 20 (Version 20), Aug 2026. https://www.dupont.com/content/dam/water/amer/us/en/water/public/documents/en/RO-NF-FilmTec-Manual-45-D01504-en.pdf
20. Hydranautics (dated 01/23/01). *Terms and Equations of Reverse Osmosis*. Distributor mirror (Lenntech): https://www.lenntech.com/Data-sheets/Hydranautics-Terms-Equations-RO.pdf
21. Hydranautics (dated 01/23/01). *What Is Membrane Performance Normalization?* Distributor mirror (Lenntech): https://www.lenntech.com/Data-sheets/Hydranautics-normaliz-L.pdf
22. WateReuse Association Desalination Committee (2011). *Seawater Desalination Power Consumption*, White Paper, November 2011. https://watereuse.org/wp-content/uploads/2015/10/Power_consumption_white_paper.pdf
23. ASTM International (2019). ASTM D4516-19a, *Standard Practice for Standardizing Reverse Osmosis Performance Data*. https://doi.org/10.1520/D4516-19A and https://store.astm.org/d4516-19a.html (store page only; standard text not accessed).
24. Zhao, Y., Taylor, J.S. (2005). Assessment of ASTM D 4516 for evaluation of reverse osmosis membrane performance. *Desalination* 180:231–244. https://doi.org/10.1016/j.desal.2004.11.089 (existence only).
25. Elimelech, M., Phillip, W.A. (2011). The future of seawater desalination: energy, technology, and the environment. *Science* 333(6043):712–717. https://doi.org/10.1126/science.1200488 (abstract only).
26. Biesheuvel, P.M., Porada, S., Wang, L., Wang, R., Elimelech, M., Dykstra, J.E. (2025). A concise tutorial review of reverse osmosis and electrodialysis. arXiv:2110.07506v6. https://arxiv.org/abs/2110.07506. An earlier version was published as Biesheuvel, Porada, Elimelech & Dykstra (2022), *J. Membr. Sci.* 647:120221, https://doi.org/10.1016/j.memsci.2021.120221.
27. Mistry, K.H., Lienhard V, J.H. (2013). Generalized least energy of separation for desalination and other chemical separation processes. *Entropy* 15(6):2046–2080. https://doi.org/10.3390/e15062046 (MIT copy: http://hdl.handle.net/1721.1/80326).
28. Voutchkov, N. (2018). Energy use for membrane seawater desalination – current status and trends. *Desalination* 431:2–14. https://doi.org/10.1016/j.desal.2017.10.033 (existence only).
29. Kim, J., Park, K., Yang, D.R., Hong, S. (2019). A comprehensive review of energy consumption of seawater reverse osmosis desalination plants. *Applied Energy* 254:113652. https://doi.org/10.1016/j.apenergy.2019.113652 (abstract only).
30. Schunke, A.J., Hernandez Herrera, G.A., Padhye, L., Berry, T.-A. (2020). Energy Recovery in SWRO Desalination: Current Status and New Possibilities. *Frontiers in Sustainable Cities* 2:9. https://doi.org/10.3389/frsc.2020.00009
31. Gude, V.G., Fthenakis, V. (2020). Energy efficiency and renewable energy utilization in desalination systems. *Progress in Energy* 2(2):022003. https://doi.org/10.1088/2516-1083/ab7bf6
32. Energy Recovery, Inc. (2025). *PX Q400: Highly Efficient Energy Recovery Device*, white paper, January 2025. https://energyrecovery.com/wp-content/uploads/2024/11/Whitepaper_PXQ400_Highly_Efficient_Energy_Recovery_Device.pdf
33. Stover, R.L. (2007). Seawater reverse osmosis with isobaric energy recovery devices. *Desalination* 203:168–175. https://doi.org/10.1016/j.desal.2006.03.528 (existence only).
34. Sheppard, C., Al-Husiani, M., Al-Jamali, F., et al. (2010). The Gulf: A young sea in decline. *Marine Pollution Bulletin* 60(1):13–38. https://doi.org/10.1016/j.marpolbul.2009.10.017
35. Miyakawa, H., Maghram Al Shaiae, M., Green, T.N., Ito, Y., Sugawara, Y., Onishi, M., Fusaoka, Y., Farooque Ayumantakath, M., Al Amoudi, A.S. (2021). Reliable Sea Water RO Operation with High Water Recovery and No-Chlorine/No-SBS Dosing in Arabian Gulf, Saudi Arabia. *Membranes* 11(2):141. https://doi.org/10.3390/membranes11020141
36. Richlen, M.L., Morton, S.L., Jamali, E.A., Rajan, A., Anderson, D.M. (2010). The catastrophic 2008–2009 red tide in the Arabian gulf region, with observations on the identification and phylogeny of the fish-killing dinoflagellate *Cochlodinium polykrikoides*. *Harmful Algae* 9:163–172. https://doi.org/10.1016/j.hal.2009.08.013 (existence only).
37. Gómez, F., Richlen, M.L., Anderson, D.M. (2017). Molecular characterization and morphology of *Cochlodinium strangulatum*, the type species of *Cochlodinium*, and *Margalefidinium* gen. nov. for *C. polykrikoides* and allied species (Gymnodiniales, Dinophyceae). *Harmful Algae* 63:32–44. https://doi.org/10.1016/j.hal.2017.01.008 (title only).
38. Anderson, D.M., Boerlage, S.F.E., Dixon, M.B. (Eds.) (2017). *Harmful Algal Blooms (HABs) and Desalination: A Guide to Impacts, Monitoring and Management*. IOC Manuals and Guides No. 78, IOC-UNESCO, Paris. Chapter 2: Hess, P., Villacorte, L.O., Dixon, M.B., Boerlage, S.F.E., Anderson, D.M., Kennedy, M.D., Schippers, J.C., "Algal issues in seawater desalination". https://archimer.ifremer.fr/doc/00407/51837/ and https://unesdoc.unesco.org/ark:/48223/pf0000259512
39. UAE Government (u.ae). "The UAE Water Security Strategy 2036" (updated 25 Aug 2026). https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/environment-and-energy/the-uae-water-security-strategy-2036
40. UAE Government (u.ae). "Water" (updated 08 Sep 2026). https://u.ae/en/information-and-services/environment-and-energy/Natural-resources/water-
41. UAE Government (u.ae). "6. Clean water and sanitation" (updated 30 Dec 2024). https://u.ae/en/about-the-uae/leaving-no-one-behind/6cleanwaterandsanitation
42. Al Wasmi, N. (2017, 2 Feb). Demand for desalinated water puts pressure on Gulf ecosystems. *The National*. https://www.thenationalnews.com/uae/demand-for-desalinated-water-puts-pressure-on-gulf-ecosystems-1.66295 (news source).
43. ACWA Power. "Taweelah RO Desalination IWP" (project page). https://acwapower.com/en/what-we-do/projects/taweelah-ro-desalination-iwp/
44. World Health Organization (2022). *Guidelines for drinking-water quality: fourth edition incorporating the first and second addenda*. Geneva: WHO. ISBN 978-92-4-004506-4. https://www.who.int/publications/i/item/9789240045064 and https://iris.who.int/handle/10665/352532
45. World Health Organization (2011). *Safe drinking-water from desalination*. WHO/HSE/WSH/11.03. https://iris.who.int/handle/10665/70621
46. Ember (2026), with processing by Our World in Data. "Lifecycle carbon intensity of electricity generation" (dataset updated 2026-06-30). https://ourworldindata.org/grapher/carbon-intensity-electricity. Ember UAE page: https://ember-energy.org/countries-and-regions/united-arab-emirates/
47. Willard, J., Jia, X., Xu, S., Steinbach, M., Kumar, V. (2023; commonly cited as 2022). Integrating Scientific Knowledge with Machine Learning for Engineering and Environmental Systems. *ACM Computing Surveys* 55(4):1–37. https://doi.org/10.1145/3514228
48. Karpatne, A., Atluri, G., Faghmous, J.H., Steinbach, M., Banerjee, A., Ganguly, A., Shekhar, S., Samatova, N., Kumar, V. (2017). Theory-Guided Data Science: A New Paradigm for Scientific Discovery from Data. *IEEE Transactions on Knowledge and Data Engineering* 29(10):2318–2331. https://doi.org/10.1109/TKDE.2017.2720168
49. Angelopoulos, A.N., Bates, S. (2023). Conformal Prediction: A Gentle Introduction. *Foundations and Trends in Machine Learning* 16(4):494–591. https://doi.org/10.1561/2200000101. Preprint: arXiv:2107.07511, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification", https://arxiv.org/abs/2107.07511
50. Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., et al. (2011). Scikit-learn: Machine Learning in Python. *Journal of Machine Learning Research* 12:2825–2830. https://jmlr.org/papers/v12/pedregosa11a.html
51. scikit-learn developers. `sklearn.ensemble.HistGradientBoostingRegressor` documentation (v1.9.1). https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html
52. Lee, K., Lee, K., Lee, H., Shin, J. (2018). A Simple Unified Framework for Detecting Out-of-Distribution Samples and Adversarial Attacks. *Advances in Neural Information Processing Systems* 31. https://proceedings.neurips.cc/paper/2018/hash/abdeb6f575ac5c6676b747bca8d09cc2-Abstract.html; arXiv:1807.03888.
53. Ghorbani Bam, P., Rezaei, N., Roubanis, A., Austin, D., Austin, E., Tarroja, B., Takacs, I., Villez, K. (2025). Digital Twin Applications in the Water Sector: A Review. *Water* 17(20):2957. https://doi.org/10.3390/w17202957
54. Wang, A.-J., Li, H., He, Z., Tao, Y., Wang, H., Yang, M., Savic, D., Daigger, G.T., Ren, N. (2024). Digital Twins for Wastewater Treatment: A Technical Review. *Engineering* 36:21–35. https://doi.org/10.1016/j.eng.2024.04.012
55. Torfs, E., Nicolaï, N., Daneshgar, S., Copp, J.B., Haimi, H., Ikumi, D., Johnson, B., Plosz, B.B., Snowling, S., Townley, L.R., Valverde-Pérez, B., Vanrolleghem, P.A., Vezzaro, L., Nopens, I. (2022). The transition of WRRF models to digital twin applications. *Water Science and Technology* 85(10):2840–2853. https://doi.org/10.2166/wst.2022.107
56. Pedersen, A.N., Borup, M., Brink-Kjær, A., Christiansen, L.E., Mikkelsen, P.S. (2021). Living and Prototyping Digital Twins for Urban Water Systems: Towards Multi-Purpose Value Creation Using Models and Sensors. *Water* 13(5):592. https://doi.org/10.3390/w13050592
57. Cuba, Y., Avila, D., Quiza, R., Marichal, G.N. (2025). Digital twin to optimise the cost of electricity consumed by a water desalination plant under a time-based tariff. *Water Reuse* 15(3):509–527. https://doi.org/10.2166/wrd.2025.039
58. Roehl, E.A., Ladner, D.A., Daamen, R.C., Cook, J.B., Safarik, J., Phipps, D.W., Xie, P. (2018). Modeling fouling in a large RO system with artificial neural networks. *Journal of Membrane Science* 552:95–106. https://doi.org/10.1016/j.memsci.2018.01.064
59. Park, S., Baek, S.-S., Pyo, J., Pachepsky, Y., Park, J., Cho, K.H. (2019). Deep neural networks for modeling fouling growth and flux decline during NF/RO membrane filtration. *Journal of Membrane Science* 587:117164. https://doi.org/10.1016/j.memsci.2019.06.004
60. Jawad, J., Hawari, A.H., Zaidi, S.J. (2021). Artificial neural network modeling of wastewater treatment and desalination using membrane processes: A review. *Chemical Engineering Journal* 419:129540. https://doi.org/10.1016/j.cej.2021.129540
61. Aish, A.M., Zaqoot, H.A., Abdeljawad, S.M. (2015). Artificial neural network approach for predicting reverse osmosis desalination plants performance in the Gaza Strip. *Desalination* 367:240–247. https://doi.org/10.1016/j.desal.2015.04.008
62. Khalifa University (2026, 27 Aug). Khalifa University Launches Global Water Hackathon 2026 to Accelerate Solutions to Global Water Challenges. https://www.ku.ac.ae/khalifa-university-launches-global-water-hackathon-2026-to-accelerate-solutions-to-global-water-challenges
63. Khalifa University (2026, 24 Sep). Nearly 1,400 Students from 56 Countries Join Khalifa University-UNESCO Global Water Hackathon 2026. https://www.ku.ac.ae/nearly-1400-students-from-56-countries-join-khalifa-university-unesco-global-water-hackathon-2026
64. Khalifa University CMAT. Khalifa University – UNESCO Global Water Hackathon 2026 (program page). https://ku.events/global_water_hackathon_2026/
65. Khalifa University CMAT (2026). *Hackathon Guidelines* (PDF, 4 pp.). https://ku.events/global_water_hackathon_2026/assets/attachments/Water_Hackathon_2026_Guidlines.pdf
66. Khalifa University. Khalifa University – UN Global Water Hackathon 2026, registration page. https://apps.ku.ac.ae/UNESCO2026/

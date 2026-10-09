# References

Keys in square brackets are the tags used in the code (`[ref:KEY]` in `src/sim/config.ts`) and in [MODEL.md](MODEL.md). Every entry below was verified to exist (Crossref, publisher or official page, or the document itself); the note after each entry says how much of its content was actually used. Values marked **[assumed]** in the code have no specific source and are design choices for the simulated plant. The full research log, including the parameter table and conflicts found, is in [research/research-notes.md](research/research-notes.md).

No organisation listed here has reviewed or endorsed AquaTwin.

## Seawater properties and RO transport

- **[SHARQAWY-2010]** Sharqawy, M.H., Lienhard V, J.H., Zubair, S.M. (2010). Thermophysical properties of seawater: a review of existing correlations and data. *Desalination and Water Treatment* 16(1–3):354–380. https://doi.org/10.5004/dwt.2010.1079. Density and osmotic-coefficient correlations (via WaterTAP).
- **[WATERTAP-RO]** WaterTAP (watertap-org). Seawater property package (`seawater_prop_pack.py`) and reverse-osmosis 0D/1D unit models; documentation at https://watertap.readthedocs.io. Equations for osmotic pressure (π = φ·m·ρ_w·R·T), solution–diffusion transport and SWRO flowsheet parameter ranges; source code read directly.
- Nayar, K.G., Sharqawy, M.H., Banchik, L.D., Lienhard V, J.H. (2016). Thermophysical properties of seawater: a review and new correlations that include pressure dependence. *Desalination* 390:1–24. https://doi.org/10.1016/j.desal.2016.02.024. Density check.
- Millero, F.J., Feistel, R., Wright, D.G., McDougall, T.J. (2008). The composition of Standard Seawater and the definition of the Reference-Composition Salinity Scale. *Deep-Sea Research I* 55(1):50–72. https://doi.org/10.1016/j.dsr.2007.10.001. Molar mass of sea salt (31.4038 g/mol), used via WaterTAP.
- IOC, SCOR, IAPSO (2010). *The international thermodynamic equation of seawater-2010 (TEOS-10)*. IOC Manuals and Guides No. 56, UNESCO. https://www.teos-10.org/pubs/TEOS-10_Manual.pdf. Independent check of the osmotic pressure of standard seawater (≈ 25.7–25.9 bar).
- Biesheuvel, P.M., Porada, S., Wang, L., Wang, R., Elimelech, M., Dykstra, J.E. (2025). A concise tutorial review of reverse osmosis and electrodialysis. arXiv:2110.07506. https://arxiv.org/abs/2110.07506. Solution–diffusion and film-theory background.

## Membrane manufacturer data and practice

- **[FILMTEC-SW30]** DuPont. FilmTec™ SW30HRLE-440i (Form 45-D00965-en, Rev. 5, 2024) and SW30XLE-440i (Form 45-D00974-en, Rev. 7, 2026) product data sheets. Element area (40.9 m²), test permeate flow and rejection used to bracket A and B, maximum pressure 83 bar, maximum ΔP per vessel.
- **[DUPONT-MANUAL]** DuPont (2026). *FilmTec™ Reverse Osmosis Membranes Technical Manual*, Form 45-D01504-en, Rev. 20; and *Membrane System Design Guidelines for 8-inch FilmTec™ Elements*, Form 45-D01695-en, Rev. 14. Temperature-correction factor constants (2640 K / 3020 K), seawater flux design range, normalisation and cleaning criteria (clean when normalised permeate flow drops 10 %, salt passage rises 5–10 % or pressure drop rises 10–15 %), fouling troubleshooting pattern.
- **[ASTM-D4516]** ASTM International (2019). ASTM D4516-19a, *Standard Practice for Standardizing Reverse Osmosis Performance Data*. https://doi.org/10.1520/D4516-19A. Concept of normalised permeate flow and salt passage (standard text paywalled and not accessed; AquaTwin implements the concept with its own model rather than the standard's equations).
- Hydranautics. *Terms and Equations of Reverse Osmosis*; *What Is Membrane Performance Normalization?* (distributor copies, Lenntech). Normalisation background.

## Energy

- **[ERI-PX]** Energy Recovery, Inc. (2025). *PX Q400: Highly Efficient Energy Recovery Device*, white paper. Isobaric ERD efficiency (up to 98 %) and volumetric mixing (3–5 %).
- **[VOUTCHKOV-2018]** Voutchkov, N. (2018). Energy use for membrane seawater desalination: current status and trends. *Desalination* 431:2–14. https://doi.org/10.1016/j.desal.2017.10.033. Whole-plant SEC ranges (existence verified; paywalled, so ranges cross-checked with the two open sources below).
- **[GUDE-2020]** Gude, V.G., Fthenakis, V. (2020). Energy efficiency and renewable energy utilization in desalination systems. *Progress in Energy* 2(2):022003. https://doi.org/10.1088/2516-1083/ab7bf6. "About 3 kWh/m³ for the Mediterranean, Atlantic and Pacific, and 4 kWh/m³ for the Arabian Gulf including pre- and post-treatment".
- WateReuse Association (2011). *Seawater Desalination Power Consumption*, white paper. Stage-by-stage energy breakdown.
- Schunke, A.J., Hernandez Herrera, G.A., Padhye, L., Berry, T.-A. (2020). Energy recovery in SWRO desalination: current status and new possibilities. *Frontiers in Sustainable Cities* 2:9. https://doi.org/10.3389/frsc.2020.00009
- Kim, J., Park, K., Yang, D.R., Hong, S. (2019). A comprehensive review of energy consumption of seawater reverse osmosis desalination plants. *Applied Energy* 254:113652. https://doi.org/10.1016/j.apenergy.2019.113652 (abstract).

## Regional conditions, water quality and carbon

- **[GULF-CONDITIONS]** Sheppard, C., et al. (2010). The Gulf: a young sea in decline. *Marine Pollution Bulletin* 60(1):13–38. https://doi.org/10.1016/j.marpolbul.2009.10.017; and Miyakawa, H., et al. (2021). Reliable seawater RO operation with high water recovery … in the Arabian Gulf. *Membranes* 11(2):141. https://doi.org/10.3390/membranes11020141. Typical Gulf salinity (≈ 40–45 g/L) and temperature ranges.
- **[HAB-UNESCO]** Anderson, D.M., Boerlage, S.F.E., Dixon, M.B. (Eds.) (2017). *Harmful Algal Blooms (HABs) and Desalination: A Guide to Impacts, Monitoring and Management*. IOC Manuals and Guides No. 78, IOC-UNESCO. https://unesdoc.unesco.org/ark:/48223/pf0000259512 (algal-bloom impacts on SWRO pretreatment and fouling); and Richlen, M.L., et al. (2010), *Harmful Algae* 9:163–172, https://doi.org/10.1016/j.hal.2009.08.013 (the 2008–09 Gulf bloom; existence only).
- **[WHO-GDWQ]** World Health Organization (2022). *Guidelines for Drinking-water Quality*, 4th ed. incl. 1st and 2nd addenda. https://www.who.int/publications/i/item/9789240045064; and WHO (2011). *Safe drinking-water from desalination*. https://iris.who.int/handle/10665/70621. TDS palatability context (no health-based guideline value for TDS).
- **[EMBER-UAE]** Ember (2026), processed by Our World in Data. Lifecycle carbon intensity of electricity generation. https://ourworldindata.org/grapher/carbon-intensity-electricity. UAE 2024 value 0.468 kg CO₂e/kWh used as the average grid factor (illustrative; not a marginal or supplier-specific factor).
- UAE Government. *The UAE Water Security Strategy 2036*. https://u.ae. Policy context.

## Machine learning, uncertainty and digital twins

- **[CONFORMAL]** Angelopoulos, A.N., Bates, S. (2023). Conformal prediction: a gentle introduction. *Foundations and Trends in Machine Learning* 16(4):494–591. https://doi.org/10.1561/2200000101. Split conformal intervals; Mondrian (group-conditional) variant.
- **[MAHALANOBIS-OOD]** Lee, K., Lee, K., Lee, H., Shin, J. (2018). A simple unified framework for detecting out-of-distribution samples and adversarial attacks. *NeurIPS* 31. https://arxiv.org/abs/1807.03888. Mahalanobis-distance OOD scoring.
- Pedregosa, F., et al. (2011). Scikit-learn: machine learning in Python. *JMLR* 12:2825–2830; scikit-learn `HistGradientBoostingRegressor` documentation (v1.9).
- Willard, J., Jia, X., Xu, S., Steinbach, M., Kumar, V. (2023). Integrating scientific knowledge with machine learning for engineering and environmental systems. *ACM Computing Surveys* 55(4). https://doi.org/10.1145/3514228. Residual (hybrid) modelling.
- Karpatne, A., et al. (2017). Theory-guided data science. *IEEE TKDE* 29(10):2318–2331. https://doi.org/10.1109/TKDE.2017.2720168
- Ghorbani Bam, P., et al. (2025). Digital twin applications in the water sector: a review. *Water* 17(20):2957. https://doi.org/10.3390/w17202957
- Torfs, E., et al. (2022). The transition of WRRF models to digital twin applications. *Water Science and Technology* 85(10):2840–2853. https://doi.org/10.2166/wst.2022.107
- Cuba, Y., Avila, D., Quiza, R., Marichal, G.N. (2025). Digital twin to optimise the cost of electricity consumed by a water desalination plant under a time-based tariff. *Water Reuse* 15(3):509–527. https://doi.org/10.2166/wrd.2025.039
- Roehl, E.A., et al. (2018). Modeling fouling in a large RO system with artificial neural networks. *Journal of Membrane Science* 552:95–106. https://doi.org/10.1016/j.memsci.2018.01.064
- Park, S., et al. (2019). Deep neural networks for modeling fouling growth and flux decline during NF/RO membrane filtration. *Journal of Membrane Science* 587:117164. https://doi.org/10.1016/j.memsci.2019.06.004

## Hackathon

- Khalifa University CMAT. Khalifa University–UNESCO Global Water Hackathon 2026, programme page and *Hackathon Guidelines*. https://ku.events/global_water_hackathon_2026/. Themes, evaluation criteria and timeline. Mentioned for context only.

## Not verified / open items

From the research log: the exact ASTM D4516 equations (paywalled), the stage breakdown in Voutchkov (2018) (paywalled), a primary source for "typical" HP pump and motor efficiencies (values used are assumed), and the attribution of a spacer Sherwood correlation (not used). None of these gaps affects a number shown as "External ref." in the product.

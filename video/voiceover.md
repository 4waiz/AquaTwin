# Voice-over script

Kokoro-82M (via `npx hyperframes tts`), voice `af_heart`, speed 1.05. Start and end times are positions in the final video (from `video/composition/timing.json`).

1. **0.55–8.55 s**: Gulf desalination plants run on fixed setpoints and fixed alarms. By the time an alarm fires, the plant is already reacting.
2. **9.30–19.73 s**: AquaTwin keeps a physics model of each reverse-osmosis train calibrated to live data, and corrects it with machine learning. Train 2, it tells us, is due for cleaning.
3. **20.50–30.44 s**: Before a salinity shock arrives, it simulates the next day. Doing nothing breaks the water-quality limit within three hours. AquaTwin's plan holds every constraint.
4. **31.15–39.28 s**: It weighs six hundred and seventy-six strategies, and a safety layer, AquaGuard, checks every limit at the edge of the model's uncertainty.
5. **39.95–45.28 s**: And when conditions go beyond what the model has learned, it says so, and withholds its advice.
6. **45.95–52.14 s**: Every result is simulated, tested against a hidden plant, and reproducible, including where it doesn't help.
7. **53.10–57.66 s**: AquaTwin. Predict, simulate, adapt, before the plant is forced to react.

Regenerate one line:

```bash
npx hyperframes tts video/composition/assets/vo/line1.txt --voice af_heart --speed 1.05 --output video/composition/assets/vo/line1.wav
```

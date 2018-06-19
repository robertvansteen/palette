const uuid = require('uuid');
const express = require('express');
const chroma = require('chroma-js');
const getPixels = require('get-pixels');
const puppeteer = require('puppeteer');
const vibrant = require('node-vibrant');
const getRgbaPalette = require('get-rgba-palette');
const engine = require('express-es6-template-engine');

const app = express();
app.engine('html', engine);
app.set('views', 'views');
app.set('view engine', 'html');

const moodMap = {
  0: ['energetic, lively'],
  39: ['active', 'energetic', 'optimistic'],
  60: ['happiness', 'cheerfulness', 'friendliness'],
  120: ['health', 'freshness'],
  240: ['peaceful', 'clean', 'calming'],
  300: ['royal', 'majestic', 'honorous'],
  // 0: ['purity', 'innocence', 'goodness'],
  // 0: ['power', 'luxury', 'sophistication', 'exclusivity'],
};

// async function getColors(page, path) {
//   await page.screenshot({ path });
//   return new Promise(resolve => {
//     getPixels(path, (err, pixels) => {
//       const palette = getRgbaPalette
//         .bins(pixels.data, 5, 1, x => {
//           return true;
//         })
//         .sort((a, b) => b.size - a.size)
//         // .filter(bin => bin.amount > 0.01)
//         .map(function(bin) {
//           console.log(bin);
//           return chroma(bin.color);
//         });
//       resolve(palette);
//     });
//   });
// }

async function getBrowser() {
  const config = {
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  return await puppeteer.launch(config);
}

async function getPalette(page, file) {
  const path = `/tmp/${file}`;
  await page.screenshot({ path });
  const palette = await vibrant
    .from(path)
    .quality(1)
    .clearFilters()
    .addFilter(() => true)
    .maxColorCount(200)
    .getPalette();

  let swatches = [];
  for (var key in palette) {
    if (palette[key]) {
      swatches.push(palette[key]);
    }
  }

  const totalPopulation = swatches.reduce((total, swatch) => {
    return total + swatch.getPopulation();
  }, 0);

  return swatches.map(swatch => {
    swatch.chroma = chroma(swatch.getHex());
    swatch.hsl = swatch.chroma.hsl();
    swatch.hue = Math.round(swatch.hsl[0]);
    swatch.saturation = Math.round(swatch.hsl[1] * 100);
    swatch.lightness = Math.round(swatch.hsl[2] * 100);
    swatch.percentage = Math.ceil(
      (swatch.getPopulation() / totalPopulation) * 100,
    );
    return swatch;
  });
}

async function getTextAverage(page, property) {
  const foobar = 'fontSize';
  return await page.$$eval(
    'body *',
    (elements, property) =>
      elements
        .filter(element =>
          [].reduce.call(
            element.childNodes,
            function(a, b) {
              return a + (b.nodeType === 3 ? b.textContent : '');
            },
            '',
          ),
        )
        .map(element =>
          parseInt(window.getComputedStyle(element)[property], 10),
        )
        .filter(n => Number.isInteger(n))
        .reduce((prev, curr, index, array) => {
          prev = prev + curr;
          if (index + 1 === array.length) {
            return prev / array.length;
          } else {
            return prev;
          }
        }),
    property,
  );
}

function getMood(swatches) {
  // Get the most prominent swatch
  const prominent = [...swatches].sort(
    (a, b) => a.getPopulation() > b.getPopulation(),
  )[0];

  if (!prominent) {
    return '';
  }

  const mood = Object.keys(moodMap).filter(color => {
    const difference = Math.abs(prominent.hue - color);
    return difference < 25;
  });

  const sentence = mood.reduce((prev, curr) => {
    prev = prev.concat(moodMap[curr]);
    return prev;
  }, []);

  return [sentence.slice(0, -1).join(', '), sentence.slice(-1)[0]].join(
    sentence.length < 2 ? '' : ' and ',
  );
}

app.use('/images', express.static('/tmp'));

app.get('/', function(req, res) {
  return res.render('base', {
    partials: {
      template: 'index',
    },
  });
});

app.get('/palette', async function(req, res) {
  const { url } = req.query;
  const file = `${uuid.v4()}.png`;

  let title;
  let mood;
  let palette;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(url);
    title = await page.title();
    swatches = await getPalette(page, file);
    fontSize = await getTextAverage(page, 'font-size');
    fontWeight = await getTextAverage(page, 'font-weight');
    mood = getMood(swatches);
    browser.close();
  } catch (error) {
    console.error(error);
    return res.render('error', { locals: { error } });
  }

  return res.render('base', {
    locals: { url, title, swatches, file, mood, fontSize, fontWeight },
    partials: {
      template: 'result',
    },
  });
});

app.listen(3000, () => console.log('> App listening on port 3000!'));

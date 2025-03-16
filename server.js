import dotenv from 'dotenv';
import jsdom from 'jsdom';
import Mailgun from 'mailgun.js';
import fetch from 'node-fetch';
import schedule from 'node-schedule';

dotenv.config();
const { JSDOM } = jsdom;
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.API_KEY,
});
const email = process.env.EMAIL;

const getCombinedStudies = () => {
  const callCelerion = async () => {
    const response = await fetch(
      'https://helpresearch.com/studies?field_csapi_gender_value=2&field_csapi_smoking_value=All&city=All&age=&maxbmi=All&minbmi=All&field_bmi_weight=&field_bmi_height='
    );
    const data = await response.text();
    const dom = new JSDOM(data);

    const getStudies = () =>
      Array.from(dom.window.document.querySelectorAll('.field-content')).map(
        name =>
          name.innerHTML.toLocaleLowerCase().includes('<span')
            ? name.textContent
            : name.innerHTML
      );

    const preSlicedStudies = getStudies();

    const slicedStudies = arr => {
      const slicedArrays = [];
      arr.map(
        (_, index) =>
          (index % 10 === 0 || index === 0) &&
          slicedArrays.push(arr.slice(index, index + 10))
      );
      return slicedArrays;
    };

    const studies = slicedStudies(preSlicedStudies);

    const movePriceToBottom = arr => {
      arr.filter(innerArray =>
        innerArray.map(item =>
          item.includes('*')
            ? innerArray.push(innerArray.splice(innerArray.indexOf(item), 1)[0])
            : item
        )
      );
      return arr;
    };

    const studiesWithPriceAtBottom = movePriceToBottom(studies);

    const sortDollarAmountsDescending = arr => {
      arr.sort((a, b) => {
        const amountA = parseFloat(a.at(-1).replace(/[^0-9.-]+/g, ''));
        const amountB = parseFloat(b.at(-1).replace(/[^0-9.-]+/g, ''));
        return amountB - amountA;
      });
      return arr;
    };

    const sortedStudies = sortDollarAmountsDescending(
      studiesWithPriceAtBottom.slice()
    );

    const celerionStudies = sortedStudies
      .filter(
        innerArray =>
          !innerArray.toString().toLowerCase().includes('overweight')
      )
      .filter(innerArray =>
        innerArray.toString().toLowerCase().includes('-ban')
      )
      .map(innerArray =>
        innerArray
          .filter(item => item !== '<i class="fas fa-smoking-ban"></i>')
          .map(name => name.replaceAll('amp;', ''))
          .join('\n')
      )
      .join('\n\n\n');

    return `CELERION STUDIES\n\n\n\n${celerionStudies}`;
  };

  const callDrVince = async () => {
    const response = await fetch('https://drvince.com/participate-in-a-study/');
    const data = await response.text();
    const dom = new JSDOM(data);

    const getStudies = () =>
      Array.from(
        dom.window.document.querySelectorAll('div.grid-posts > div')
      ).map(name =>
        name.textContent
          .replaceAll('\t', '')
          .replaceAll('\n', '')
          .replaceAll('  ', '')
      );

    const studies = getStudies();

    const sortDollarAmountsDescending = arr => {
      arr.sort((a, b) => {
        const amountA = parseFloat(
          a.match(/\$(\d+,\d{3})*/)?.[1].replace(',', '') || 0
        );
        const amountB = parseFloat(
          b.match(/\$(\d+,\d{3})*/)?.[1].replace(',', '') || 0
        );
        return amountB - amountA;
      });
      return arr;
    };

    const sortedStudies = sortDollarAmountsDescending(studies.slice());

    const drVinceStudies = sortedStudies.join('\n\n');
    return `DR. VINCE STUDIES\n\n\n\n${drVinceStudies}`;
  };

  Promise.allSettled([callCelerion(), callDrVince()])
    .then(values => values)
    .then(result => {
      const msgText = result
        .map(value => value.value.toString())
        .join('\n\n\n\n\n');

      const msg = {
        from: email,
        to: email,
        subject: 'Available Studies from Celerion and Dr. Vince',
        text: msgText,
      };
      msgText.length && mg.messages.create(process.env.DOMAIN, msg);
    })
    .catch(error => {
      console.error('Promise rejected:', error);
    });
};

const job = schedule.scheduleJob('0 */4 * * *', () => {
  getCombinedStudies();
});

getCombinedStudies();

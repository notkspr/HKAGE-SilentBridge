import {inject, Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {map, catchError} from 'rxjs/operators';
import {HttpClient} from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private http = inject(HttpClient);

  signedLanguages = [
    'ase',
    'gsg',
    'fsl',
    'bfi',
    'ils',
    'sgg',
    'ssr',
    'slf',
    'isr',
    'ssp',
    'jos',
    'rsl-by',
    'bqn',
    'csl',
    'csq',
    'cse',
    'dsl',
    'ins',
    'nzs',
    'eso',
    'fse',
    'asq',
    'gss-cy',
    'gss',
    'icl',
    'ise',
    'jsl',
    'lsl',
    'lls',
    'psc',
    'pso',
    'bzs',
    'psr',
    'rms',
    'rsl',
    'svk',
    'aed',
    'csg',
    'csf',
    'mfs',
    'swl',
    'tsm',
    'ukl',
    'pks',
  ];

  spokenLanguages = [
    'en',
    'de',
    'fr',
    'af',
    'sq',
    'am',
    'ar',
    'hy',
    'az',
    'eu',
    'be',
    'bn',
    'bs',
    'bg',
    'ca',
    'ceb',
    'ny',
    'zh',
    'co',
    'hr',
    'cs',
    'da',
    'nl',
    'eo',
    'et',
    'tl',
    'fi',
    'fy',
    'gl',
    'ka',
    'es',
    'el',
    'gu',
    'ht',
    'ha',
    'haw',
    'he',
    'hi',
    'hmn',
    'hu',
    'is',
    'ig',
    'id',
    'ga',
    'it',
    'ja',
    'jv',
    'kn',
    'kk',
    'km',
    'rw',
    'ko',
    'ku',
    'ky',
    'lo',
    'la',
    'lv',
    'lt',
    'lb',
    'mk',
    'mg',
    'ms',
    'ml',
    'mt',
    'mi',
    'mr',
    'mn',
    'my',
    'ne',
    'no',
    'or',
    'ps',
    'fa',
    'pl',
    'pt',
    'pa',
    'ro',
    'ru',
    'sm',
    'gd',
    'sr',
    'st',
    'sn',
    'sd',
    'si',
    'sk',
    'sl',
    'so',
    'su',
    'sw',
    'sv',
    'tg',
    'ta',
    'tt',
    'te',
    'th',
    'tr',
    'tk',
    'uk',
    'ur',
    'ug',
    'uz',
    'vi',
    'cy',
    'xh',
    'yi',
    'yo',
    'zu',
  ];

  private lastSpokenLanguageSegmenter: {language: string; segmenter: Intl.Segmenter};

  splitSpokenSentences(language: string, text: string): string[] {
    // If the browser does not support the Segmenter API (FireFox<127), return the whole text as a single segment
    if (!('Segmenter' in Intl)) {
      return [text];
    }

    // Construct a segmenter for the given language, can take 1ms~
    if (this.lastSpokenLanguageSegmenter?.language !== language) {
      this.lastSpokenLanguageSegmenter = {
        language,
        segmenter: new Intl.Segmenter(language, {granularity: 'sentence'}),
      };
    }
    const segments = this.lastSpokenLanguageSegmenter.segmenter.segment(text);
    return Array.from(segments).map(segment => segment.segment);
  }

  normalizeSpokenLanguageText(language: string, text: string): Observable<string> {
    const params = new URLSearchParams();
    params.set('lang', language);
    params.set('text', text);
    const url = 'https://sign.mt/api/text-normalization?' + params.toString();

    return this.http.get<{text: string}>(url).pipe(map(response => response.text));
  }

  describeSignWriting(fsw: string): Observable<string> {
    const url = 'https://sign.mt/api/signwriting-description';

    return this.http
      .post<{result: {description: string}}>(url, {data: {fsw}})
      .pipe(map(response => response.result.description));
  }

  translateTextToEnglish(text: string, sourceLanguage: string): Observable<string> {
    // If the source language is already English, return the text as is
    if (sourceLanguage === 'en' || sourceLanguage.startsWith('en-')) {
      return new Observable(subscriber => {
        subscriber.next(text);
        subscriber.complete();
      });
    }

    // Use Google Translate API (same as used in i18n-fixer.js)
    const encodedText = encodeURIComponent(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=en&dt=t&q=${encodedText}`;

    return this.http.get<any>(url).pipe(
      map(response => {
        // Google Translate API returns an array structure: [[[translatedText, originalText, null, null]], ...]
        // We need to extract the translated text from response[0][0][0]
        if (response && response[0] && response[0][0] && response[0][0][0]) {
          return response[0][0][0];
        }
        // Fallback to original text if translation fails
        return text;
      }),
      catchError(error => {
        console.error('Translation failed:', error);
        // Return original text as fallback
        return of(text);
      })
    );
  }

  translateSpokenToSigned(text: string, spokenLanguage: string, signedLanguage: string): string {
    const api = 'https://us-central1-sign-mt.cloudfunctions.net/spoken_text_to_signed_pose';
    return `${api}?text=${encodeURIComponent(text)}&spoken=${spokenLanguage}&signed=${signedLanguage}`;
  }
}

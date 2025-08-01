import {inject, Injectable} from '@angular/core';
import {Action, NgxsOnInit, State, StateContext, Store} from '@ngxs/store';
import {
  ChangeTranslation,
  CopySignedLanguageVideo,
  CopySpokenLanguageText,
  DescribeSignWritingSign,
  DownloadSignedLanguageVideo,
  FlipTranslationDirection,
  SetInputMode,
  SetSignedLanguage,
  SetSignedLanguageVideo,
  SetSignWritingText,
  SetSpokenLanguage,
  SetSpokenLanguageText,
  ShareSignedLanguageVideo,
  SuggestAlternativeText,
  TranslateToEnglish,
  UploadPoseFile,
} from './translate.actions';
import {TranslationService} from './translate.service';
import {SetVideo, StartCamera, StopVideo} from '../../core/modules/ngxs/store/video/video.actions';
import {catchError, EMPTY, filter, Observable, of, switchMap} from 'rxjs';
import {PoseViewerSetting} from '../settings/settings.state';
import {tap} from 'rxjs/operators';
import {Capacitor} from '@capacitor/core';
import {SignWritingService} from '../sign-writing/sign-writing.service';
import {SignWritingTranslationService} from './signwriting-translation.service';
import {LanguageDetectionService} from './language-detection/language-detection.service';
import type {Pose} from 'pose-format';
import {EstimatedPose} from '../pose/pose.state';
import {StoreFramePose} from '../pose/pose.actions';
import {PoseService} from '../pose/pose.service';
import {getUrlParams} from '../../core/helpers/url';

export type InputMode = 'webcam' | 'upload' | 'text';

export interface SignWritingObj {
  fsw: string;
  description?: string;
  illustration?: string;
}

export interface TranslateStateModel {
  spokenToSigned: boolean;
  inputMode: InputMode;

  spokenLanguage: string;
  signedLanguage: string;
  detectedLanguage: string;

  spokenLanguageText: string;
  translatedEnglishText?: string; // Chinese to English translation for sign language processing
  normalizedSpokenLanguageText?: string;
  spokenLanguageSentences: string[];

  signWriting: SignWritingObj[];

  signedLanguagePose: string | Pose; // TODO: use Pose object instead of URL
  signedLanguageVideo: string;
}

const initialState: TranslateStateModel = {
  spokenToSigned: true,
  inputMode: 'text',

  spokenLanguage: 'zh',
  signedLanguage: 'csl',
  detectedLanguage: null,

  spokenLanguageText: '',
  translatedEnglishText: null,
  normalizedSpokenLanguageText: null,
  spokenLanguageSentences: [],

  signWriting: [],

  signedLanguagePose: null,
  signedLanguageVideo: null,
};

@Injectable()
@State<TranslateStateModel>({
  name: 'translate',
  defaults: initialState,
})
export class TranslateState implements NgxsOnInit {
  private store = inject(Store);
  private service = inject(TranslationService);
  private swService = inject(SignWritingTranslationService);
  private poseService = inject(PoseService);
  private languageDetectionService = inject(LanguageDetectionService);

  poseViewerSetting$!: Observable<PoseViewerSetting>;
  pose$!: Observable<EstimatedPose>;

  constructor() {
    this.poseViewerSetting$ = this.store.select<PoseViewerSetting>(state => state.settings.poseViewer);
    this.pose$ = this.store.select<EstimatedPose>(state => state.pose.pose);
  }

  ngxsOnInit(context: StateContext<TranslateStateModel>): any {
    this.initFromUrl(context);

    context.dispatch(ChangeTranslation);

    // Reset video whenever viewer setting changes
    this.poseViewerSetting$.pipe(tap(() => context.dispatch(new SetSignedLanguageVideo(null)))).subscribe();
  }

  initFromUrl({dispatch, patchState}: StateContext<TranslateStateModel>) {
    const urlParams = getUrlParams();
    const urlSignedLanguage = urlParams.get('sil');
    if (urlSignedLanguage) {
      patchState({signedLanguage: urlSignedLanguage});
    }
    const urlSpokenLanguage = urlParams.get('spl');
    if (urlSpokenLanguage) {
      patchState({spokenLanguage: urlSpokenLanguage});
    }
    const urlTextParam = urlParams.get('text');
    if (urlTextParam) {
      dispatch(new SetSpokenLanguageText(urlTextParam));
    }
  }

  @Action(FlipTranslationDirection)
  async flipTranslationMode({getState, patchState, dispatch}: StateContext<TranslateStateModel>): Promise<void> {
    const {spokenToSigned, spokenLanguage, signedLanguage, detectedLanguage, signedLanguageVideo} = getState();
    patchState({
      spokenToSigned: !spokenToSigned,
      // Collapse detected language if used
      spokenLanguage: spokenLanguage ?? detectedLanguage,
      signedLanguage: signedLanguage ?? detectedLanguage,
      detectedLanguage: null,
      signedLanguageVideo: null,
    });

    if (spokenToSigned) {
      if (signedLanguageVideo) {
        dispatch([new SetInputMode('upload'), new SetVideo(signedLanguageVideo)]);
      } else {
        dispatch(new SetInputMode('webcam'));
      }
    } else {
      dispatch(new SetInputMode('text'));
    }
  }

  @Action(SetInputMode)
  async setInputMode(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {mode}: SetInputMode
  ): Promise<void> {
    const {inputMode} = getState();
    if (inputMode === mode) {
      return;
    }

    patchState({inputMode: mode});

    dispatch([StopVideo, ChangeTranslation]);

    if (mode === 'webcam') {
      dispatch(StartCamera);
    }
  }

  async detectLanguage(spokenLanguageText: string, patchState: StateContext<TranslateStateModel>['patchState']) {
    if (spokenLanguageText.length === 0) {
      patchState({detectedLanguage: null});
      return;
    }

    await this.languageDetectionService.init();
    const detectedLanguage = await this.languageDetectionService.detectSpokenLanguage(spokenLanguageText);
    patchState({detectedLanguage});
  }

  @Action(SetSpokenLanguage)
  async setSpokenLanguage(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {language}: SetSpokenLanguage
  ): Promise<void> {
    patchState({spokenLanguage: language});

    // Load and apply language detection if selected
    if (!language) {
      const {spokenLanguageText} = getState();
      await this.detectLanguage(spokenLanguageText, patchState);
    } else {
      // If switching to Chinese and we have text, trigger English translation
      const {spokenLanguageText} = getState();
      if ((language === 'zh' || language.startsWith('zh-')) && spokenLanguageText.trim()) {
        dispatch(new TranslateToEnglish());
      } else {
        // Clear English translation if switching away from Chinese
        patchState({translatedEnglishText: null});
      }
    }

    dispatch([ChangeTranslation, SuggestAlternativeText]);
  }

  @Action(SetSignedLanguage)
  async setSignedLanguage(
    {patchState, dispatch}: StateContext<TranslateStateModel>,
    {language}: SetSignedLanguage
  ): Promise<void> {
    patchState({signedLanguage: language});
    dispatch(ChangeTranslation);
  }

  @Action(SetSpokenLanguageText)
  setSpokenLanguageText(
    {patchState, getState, dispatch}: StateContext<TranslateStateModel>,
    {text}: SetSpokenLanguageText
  ): Observable<any> {
    const {spokenLanguage, spokenToSigned} = getState();
    const trimmedText = text.trim();

    patchState({spokenLanguageText: text, normalizedSpokenLanguageText: null, translatedEnglishText: null});

    if (!spokenToSigned) {
      return EMPTY;
    }

    // Check if we need to translate to English first (for Chinese input)
    if (spokenLanguage && (spokenLanguage === 'zh' || spokenLanguage.startsWith('zh-')) && trimmedText) {
      dispatch(new TranslateToEnglish());
      // Don't call processOriginalText immediately for Chinese - wait for translation to complete
      return EMPTY;
    }

    // Process the text normally for non-Chinese languages
    return this.processOriginalText(trimmedText, spokenLanguage, patchState, dispatch);
  }

  private processOriginalText(
    trimmedText: string,
    spokenLanguage: string,
    patchState: StateContext<TranslateStateModel>['patchState'],
    dispatch: StateContext<TranslateStateModel>['dispatch']
  ): Observable<any> {
    const detectLanguage = this.detectLanguage(trimmedText, patchState);

    // Create an observable that handles the async operations
    return new Observable(subscriber => {
      (async () => {
        try {
          // Wait for language detection if language is not selected
          if (!spokenLanguage) {
            await detectLanguage;
          }

          // Get spoken language from updated state
          const {detectedLanguage} = this.store.selectSnapshot(state => state.translate);
          const assumedSpokenLanguage = spokenLanguage || detectedLanguage;
          patchState({spokenLanguageSentences: this.service.splitSpokenSentences(assumedSpokenLanguage, trimmedText)});

          dispatch(ChangeTranslation);
          subscriber.next(null);
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  @Action(SuggestAlternativeText, {cancelUncompleted: true})
  suggestAlternativeText({patchState, getState}: StateContext<TranslateStateModel>) {
    const {spokenToSigned, spokenLanguageText, spokenLanguage, detectedLanguage} = getState();
    const trimmedText = spokenLanguageText.trim();
    if (!spokenToSigned || !trimmedText || spokenLanguage !== detectedLanguage) {
      return EMPTY;
    }

    if ('navigator' in globalThis && !navigator.onLine) {
      return EMPTY;
    }

    return this.service.normalizeSpokenLanguageText(spokenLanguage, trimmedText).pipe(
      filter(text => text !== trimmedText),
      tap(text => patchState({normalizedSpokenLanguageText: text}))
    );
  }

  @Action(TranslateToEnglish, {cancelUncompleted: true})
  translateToEnglish({patchState, getState, dispatch}: StateContext<TranslateStateModel>) {
    const {spokenToSigned, spokenLanguageText, spokenLanguage} = getState();
    const trimmedText = spokenLanguageText.trim();

    if (!spokenToSigned || !trimmedText || !spokenLanguage) {
      return EMPTY;
    }

    // Only translate if the source language is Chinese
    if (!(spokenLanguage === 'zh' || spokenLanguage.startsWith('zh-'))) {
      return EMPTY;
    }

    if ('navigator' in globalThis && !navigator.onLine) {
      return EMPTY;
    }

    return this.service.translateTextToEnglish(trimmedText, spokenLanguage).pipe(
      tap(englishText => {
        patchState({translatedEnglishText: englishText});

        // Now process the text with sentences and trigger sign language translation
        const sentences = this.service.splitSpokenSentences(spokenLanguage, trimmedText);
        patchState({spokenLanguageSentences: sentences});

        // Trigger sign language translation after English translation is complete
        dispatch(ChangeTranslation);
      }),
      catchError(error => {
        console.error('Failed to translate to English:', error);
        return EMPTY;
      })
    );
  }

  @Action(DescribeSignWritingSign, {cancelUncompleted: true})
  describeSignWritingSign({patchState, getState}: StateContext<TranslateStateModel>, {fsw}: DescribeSignWritingSign) {
    if ('navigator' in globalThis && !navigator.onLine) {
      return EMPTY;
    }

    return this.service.describeSignWriting(fsw).pipe(
      catchError(e => of(e.message)),
      tap((description: string) => {
        const {signWriting} = getState();
        const newSignWriting = signWriting.map(s => {
          const obj: SignWritingObj = {...s};
          if (obj.fsw === fsw) {
            obj.description = description;
          }
          return obj;
        });
        patchState({signWriting: newSignWriting});
      })
    );
  }

  @Action(SetSignedLanguageVideo)
  async setSignedLanguageVideo(
    {patchState}: StateContext<TranslateStateModel>,
    {url}: SetSignedLanguageVideo
  ): Promise<void> {
    patchState({signedLanguageVideo: url});
  }

  @Action(SetSignWritingText)
  async setSignWritingText({patchState}: StateContext<TranslateStateModel>, {text}: SetSignWritingText): Promise<void> {
    // signNormalize only works after the SignWriting font is loaded
    await SignWritingService.loadFonts();
    await SignWritingService.cssLoaded();

    const signWritingTexts: string[] = await Promise.all(
      text.map(sign => {
        const box = sign.startsWith('M') ? sign : 'M500x500' + sign;
        return SignWritingService.normalizeFSW(box);
      })
    );
    const signWriting = signWritingTexts.map(fsw => ({fsw}));
    patchState({signWriting});
  }

  @Action(ChangeTranslation, {cancelUncompleted: true})
  changeTranslation({getState, patchState, dispatch}: StateContext<TranslateStateModel>): Observable<any> {
    const {
      spokenToSigned,
      spokenLanguage,
      signedLanguage,
      detectedLanguage,
      spokenLanguageText,
      translatedEnglishText,
      spokenLanguageSentences,
    } = getState();
    if (spokenToSigned) {
      patchState({signedLanguageVideo: null, signWriting: null}); // reset the signed language translation

      const trimmedSpokenLanguageText = spokenLanguageText.trim();
      if (!trimmedSpokenLanguageText) {
        patchState({signedLanguagePose: null, signWriting: []});
      } else {
        const actualSpokenLanguage = spokenLanguage || detectedLanguage;

        // Use English translation for sign language generation if available (for Chinese input)
        const textForSignLanguage = translatedEnglishText || trimmedSpokenLanguageText;
        const languageForSignLanguage = translatedEnglishText ? 'en' : actualSpokenLanguage;

        const path = this.service.translateSpokenToSigned(textForSignLanguage, languageForSignLanguage, signedLanguage);
        patchState({signedLanguagePose: path});

        // For SignWriting, also use English translation if available
        const sentencesForSignWriting = translatedEnglishText
          ? this.service.splitSpokenSentences('en', translatedEnglishText)
          : spokenLanguageSentences;

        return this.swService
          .translateSpokenToSignWriting(
            textForSignLanguage,
            sentencesForSignWriting,
            languageForSignLanguage,
            signedLanguage
          )
          .pipe(tap(({text}) => dispatch(new SetSignWritingText(text.split(' ')))));
      }
    }

    return EMPTY;
  }

  @Action(UploadPoseFile)
  uploadPoseFile({getState, patchState}: StateContext<TranslateStateModel>, {url}: UploadPoseFile): void {
    const {spokenToSigned} = getState();
    if (spokenToSigned) {
      patchState({signedLanguagePose: url, signedLanguageVideo: initialState.signedLanguageVideo});
    }
  }

  @Action(CopySignedLanguageVideo)
  async copySignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {signedLanguageVideo} = getState();

    const data = await fetch(signedLanguageVideo);
    const blob = await data.blob();
    try {
      const item = new ClipboardItem({[blob.type]: Promise.resolve(blob)});
      await navigator.clipboard.write([item]);
    } catch (e) {
      console.error(e);
      alert(`Copying "${blob.type}" on this device is not supported`);
    }
  }

  @Action(CopySpokenLanguageText)
  async copySpokenLanguageText({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {spokenLanguageText} = getState();

    try {
      const {Clipboard} = await import(/* webpackChunkName: "@capacitor/clipboard" */ '@capacitor/clipboard');
      await Clipboard.write({string: spokenLanguageText});
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  async shareNative(file: File) {
    // Save video to file system
    const {Directory, Filesystem} = await import(
      /* webpackChunkName: "@capacitor/filesystem" */ '@capacitor/filesystem'
    );
    const {blobToBase64} = await import(/* webpackChunkName: "base64-blob" */ 'base64-blob');

    const data = await blobToBase64(file);
    const fileOptions = {directory: Directory.Cache, path: 'video.mp4'};
    await Filesystem.writeFile({...fileOptions, data});
    const {uri} = await Filesystem.getUri(fileOptions);

    // Share video
    const {Share} = await import(/* webpackChunkName: "@capacitor/share" */ '@capacitor/share');
    await Share.share({url: uri});
  }

  async shareWeb(file: File) {
    if (!('share' in navigator)) {
      // For example in non-HTTPS on iOS
      alert(`Share functionality is not available`);
      return;
    }

    const files: File[] = [file];

    const url = window.location.href;
    const title = 'Signed Language Video for text';

    if ('canShare' in navigator && (navigator as any).canShare({files})) {
      // Apps like WhatsApp only support sharing a single item
      await navigator.share({files} as ShareData);
    } else {
      // TODO convert the video to GIF, try to share the GIF.
      await navigator.share({text: title, title, url});
    }
  }

  @Action(ShareSignedLanguageVideo)
  async shareSignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {signedLanguageVideo} = getState();

    const data = await fetch(signedLanguageVideo);
    let blob = await data.blob();
    const ext = blob.type.split('/').pop();

    const file = new File([blob], 'video.' + ext, {type: blob.type});

    if (Capacitor.isNativePlatform()) {
      return this.shareNative(file);
    }

    return this.shareWeb(file);
  }

  @Action(DownloadSignedLanguageVideo)
  async downloadSignedLanguageVideo({getState}: StateContext<TranslateStateModel>): Promise<void> {
    const {signedLanguageVideo, spokenLanguageText} = getState();

    let filename = encodeURIComponent(spokenLanguageText).replaceAll('%20', '-');
    // File names are limited to 255 characters, so we limit to 250 to be safe with the extension
    filename = filename.slice(0, 250);

    const a = document.createElement('a');
    a.href = signedLanguageVideo;
    a.download = filename;
    document.body.appendChild(a);
    try {
      a.click();
    } catch (e) {
      alert(`Downloading "${filename}" on this device is not supported`);
    }
    document.body.removeChild(a);
  }

  // Listen to pose estimation results from the pose store
  @Action(StoreFramePose)
  storePose({getState, patchState}: StateContext<TranslateStateModel>, {pose}: StoreFramePose): void {
    const {signedLanguagePose} = getState();
    const components = ['poseLandmarks', 'faceLandmarks', 'leftHandLandmarks', 'rightHandLandmarks'];
    const normalizedPoseFrame = this.poseService.normalizeHolistic(pose, components);

    // patchState({signedLanguagePose: normalizedPose});
  }
}

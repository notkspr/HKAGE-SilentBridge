import {Component} from '@angular/core';
import {TranslateDesktopComponent} from '../translate-desktop/translate-desktop.component';
import {IonContent, IonFooter, IonHeader, IonTitle, IonToolbar} from '@ionic/angular/standalone';
import {SpokenLanguageInputComponent} from '../spoken-to-signed/spoken-language-input/spoken-language-input.component';
import {SignedLanguageOutputComponent} from '../spoken-to-signed/signed-language-output/signed-language-output.component';
import {SignedLanguageInputComponent} from '../signed-to-spoken/signed-language-input/signed-language-input.component';
import {LanguageSelectorsComponent} from '../language-selectors/language-selectors.component';
import {VideoModule} from '../../../components/video/video.module';
import {LogoComponent} from '../../../components/logo/logo.component';

@Component({
  selector: 'app-translate-mobile',
  templateUrl: './translate-mobile.component.html',
  styleUrls: ['./translate-mobile.component.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonFooter,
    SignedLanguageOutputComponent,
    SignedLanguageInputComponent,
    SpokenLanguageInputComponent,
    VideoModule,
    LanguageSelectorsComponent,
    LogoComponent,
  ],
})
export class TranslateMobileComponent extends TranslateDesktopComponent {}

import {Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {IonButton, IonButtons, IonFabButton, IonIcon, IonTitle, IonToolbar} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {cameraReverseOutline, ellipseOutline} from 'ionicons/icons';
import {UploadComponent} from '../upload/upload.component';

@Component({
  selector: 'app-signed-language-input',
  templateUrl: './signed-language-input.component.html',
  styleUrl: './signed-language-input.component.scss',
  imports: [IonToolbar, IonButtons, IonButton, IonFabButton, IonTitle, IonIcon, UploadComponent],
})
export class SignedLanguageInputComponent {
  private router = inject(Router);

  constructor() {
    addIcons({ellipseOutline, cameraReverseOutline});
  }

  onEmergencyClick() {
    // Navigate to emergency page
    console.log('Emergency button clicked'); // Debug log for iOS testing
    this.router.navigate(['/emergency']);
  }

  // Additional method for iOS touch event handling
  onEmergencyTouchEnd(event: TouchEvent) {
    event.preventDefault();
    this.onEmergencyClick();
  }
}

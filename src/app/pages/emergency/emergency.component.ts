import {Component, inject} from '@angular/core';
import {IonButton, IonContent, IonIcon, AlertController, ToastController} from '@ionic/angular/standalone';
import {notifications, locationOutline, arrowBack} from 'ionicons/icons';
import {addIcons} from 'ionicons';
import {Router} from '@angular/router';

@Component({
  selector: 'app-emergency',
  templateUrl: './emergency.component.html',
  styleUrls: ['./emergency.component.scss'],
  imports: [IonContent, IonButton, IonIcon],
})
export class EmergencyComponent {
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private router = inject(Router);

  constructor() {
    addIcons({notifications, locationOutline, arrowBack});
  }

  async onEmergencyBellClick() {
    try {
      console.log('Emergency button clicked, requesting location...');

      // Get current location using browser geolocation API
      const location = await this.getCurrentLocation();

      if (location) {
        console.log('Location obtained:', location);
        // Create emergency SMS
        await this.sendEmergencySMS(location);
      } else {
        console.log('Location not obtained');
      }
    } catch (error) {
      console.error('Emergency action failed:', error);
      await this.showErrorToast('無法發送緊急求助訊息');
    }
  }

  private async getCurrentLocation(): Promise<{latitude: number; longitude: number} | null> {
    return new Promise((resolve, reject) => {
      console.log('Checking geolocation support...');

      if (!navigator.geolocation) {
        console.error('Geolocation is not supported by this browser');
        this.showErrorToast('此瀏覽器不支援位置服務');
        resolve(null);
        return;
      }

      console.log('Geolocation is supported, checking permissions...');

      // Check if Permissions API is available
      if (navigator.permissions) {
        navigator.permissions
          .query({name: 'geolocation'})
          .then(permissionStatus => {
            console.log('Current permission state:', permissionStatus.state);

            if (permissionStatus.state === 'denied') {
              this.showErrorToast('位置存取權限被拒絕。請在瀏覽器設定中允許位置存取權限。');
              resolve(null);
              return;
            }

            // Continue with location request
            this.requestLocation(resolve);
          })
          .catch(() => {
            // Fallback if Permissions API is not available
            console.log('Permissions API not available, proceeding with location request');
            this.requestLocation(resolve);
          });
      } else {
        // Fallback if Permissions API is not available
        console.log('Permissions API not available, proceeding with location request');
        this.requestLocation(resolve);
      }
    });
  }

  private requestLocation(resolve: (value: {latitude: number; longitude: number} | null) => void) {
    console.log('Requesting current position...');

    navigator.geolocation.getCurrentPosition(
      position => {
        console.log('Location obtained successfully:', position.coords);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.error('Geolocation error:', error);
        console.log('Error code:', error.code);
        console.log('Error message:', error.message);

        let errorMessage = '無法獲取位置資訊';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage =
              '位置存取權限被拒絕。請檢查瀏覽器網址列左側的位置圖示，或在瀏覽器設定中允許此網站存取位置資訊。';
            console.log('User denied location permission');
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '位置資訊無法使用';
            console.log('Location information unavailable');
            break;
          case error.TIMEOUT:
            errorMessage = '獲取位置資訊超時';
            console.log('Location request timed out');
            break;
          default:
            console.log('Unknown geolocation error');
        }

        this.showErrorToast(errorMessage);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  private async sendEmergencySMS(location: {latitude: number; longitude: number}) {
    try {
      // Format location string
      const locationString = `緯度: ${location.latitude.toFixed(6)}, 經度: ${location.longitude.toFixed(6)}`;

      // Create SMS URL with message body (removed Google Maps link)
      const message = encodeURIComponent(`聾人需要緊急求助！我目前的位置是：${locationString}`);
      const smsUrl = `sms:+85299999992?body=${message}`;

      // Send SMS directly without confirmation
      window.location.href = smsUrl;

      // Show success toast
      await this.showSuccessToast('緊急求助訊息已準備發送');
    } catch (error) {
      console.error('Failed to create SMS:', error);
      await this.showErrorToast('無法建立緊急求助訊息');
    }
  }

  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  goBack() {
    this.router.navigate(['/']);
  }
}

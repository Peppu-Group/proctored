// utils/swalQuiz.js
import Swal from 'sweetalert2';

export function createQuiz() {
  Swal.fire({
    imageUrl: 'https://drive.google.com/thumbnail?id=1bNd6yKJzV7_i_u6AB9y6ZWFVmgznccSn&sz=w1000',
    title: '<span style="color: #4CAF50; font-weight: 600;">How to create a Quiz</span>',
    html: `
      <div style="text-align: left; margin-top: 15px;">
        <p style="margin-bottom: 16px;">You can only create your project from Google form:</p>
        <ul style="list-style-type: none; padding-left: 5px;">
          <li style="position: relative; padding-left: 30px; margin-bottom: 12px;">
            <span style="position: absolute; left: 0; color: #4776E6; font-weight: bold;">1.</span>
            Install <b>Proctored by Peppubuild</b> from the Google Marketplace™.
          </li>
          <li style="position: relative; padding-left: 30px; margin-bottom: 12px;">
            <span style="position: absolute; left: 0; color: #4776E6; font-weight: bold;">2.</span>
            Open your Google Forms™, click the add-on icon as seen in the image above, and select "Proctored by Peppubuild."
          </li>
          <li style="position: relative; padding-left: 30px; margin-bottom: 12px;">
            <span style="position: absolute; left: 0; color: #4776E6; font-weight: bold;">3.</span>
            Configure your exam and adjust the timer to fit your needs.
          </li>
          <li style="position: relative; padding-left: 30px;">
            <span style="position: absolute; left: 0; color: #4776E6; font-weight: bold;">4.</span>
            You will be directed back here, with your quiz automatically added to your dashboard.
          </li>
        </ul>
      </div>
    `,
    confirmButtonColor: '#4776E6',
    background: '#ffffff',
    showClass: {
      popup: 'animate__animated animate__fadeIn animate__faster'
    },
    customClass: {
      popup: 'swal-wide'
    }
  });
}

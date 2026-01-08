// BUILDPRAX MEASURE PRO - Website JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll effect to header
    let lastScrollTop = 0;
    const header = document.querySelector('.header');
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        lastScrollTop = scrollTop;
    });

    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards and other elements
    const animatedElements = document.querySelectorAll('.feature-card, .download-card, .pricing-card, .support-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Registration Modal Functions
function showRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (modal) {
        // Get selected platform to show appropriate message
        const selectedPlatform = localStorage.getItem('selectedPlatform');
        const isWindows = selectedPlatform === 'windows';
        
        // Update modal title/message based on platform
        const modalTitle = modal.querySelector('h2');
        const modalDescription = modal.querySelector('p');
        if (modalTitle && modalDescription) {
            if (isWindows) {
                modalTitle.textContent = 'Download BUILDPRAX MEASURE PRO for Windows';
                modalDescription.textContent = 'Complete the form below to get your download link. You\'ll be redirected to the Microsoft Store after submission.';
            } else {
                modalTitle.textContent = 'Download BUILDPRAX MEASURE PRO for macOS';
                modalDescription.textContent = 'Complete the form below to start your 14-day free trial. You\'ll receive the download link immediately.';
            }
        }
        
        // Update platform field in form
        const platformField = document.getElementById('platform');
        if (platformField) {
            if (isWindows) {
                platformField.value = 'Windows';
            } else if (selectedPlatform === 'mac') {
                platformField.value = 'macOS';
            } else {
                platformField.value = selectedPlatform ? selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1) : '';
            }
        }
        
        // Reset form (but preserve platform field)
        const form = document.getElementById('registrationForm');
        if (form) {
            const platformValue = platformField ? platformField.value : '';
            form.reset();
            // Restore platform value after reset
            if (platformField && platformValue) {
                platformField.value = platformValue;
            }
        }
        
        // Show modal
        modal.style.display = 'block';
    }
}

function closeRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'none';
}

// Payment Modal Functions
function showPaymentModal() {
    document.getElementById('paymentModal').style.display = 'block';
    initializePayPalButton();
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const registrationModal = document.getElementById('registrationModal');
    const paymentModal = document.getElementById('paymentModal');
    
    if (event.target === registrationModal) {
        closeRegistrationModal();
    }
    if (event.target === paymentModal) {
        closePaymentModal();
    }
}

// Registration Form Handler
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('email').value.trim();
            const platform = document.getElementById('platform') ? document.getElementById('platform').value.trim() : '';
            const company = document.getElementById('company').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const addressLine1 = document.getElementById('addressLine1') ? document.getElementById('addressLine1').value.trim() : '';
            const city = document.getElementById('city') ? document.getElementById('city').value.trim() : '';
            const country = document.getElementById('country') ? document.getElementById('country').value.trim() : '';
            const source = document.getElementById('source') ? document.getElementById('source').value : '';
            
            // Validate platform field
            if (!platform) {
                showMessage('Platform is required. Please click the download button again.', 'error');
                return;
            }
            
            // Basic validation - ensure required fields are filled
            if (!firstName || !lastName || !email || !city || !country) {
                showMessage('Please fill in all required fields (First Name, Last Name, Email, City, and Country).', 'error');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showMessage('Please enter a valid email address.', 'error');
                return;
            }
            
            // Check if platform was selected (should be set by downloadForPlatform)
            const selectedPlatform = localStorage.getItem('selectedPlatform');
            if (!selectedPlatform) {
                showMessage('Please select a platform by clicking the download button again.', 'error');
                return;
            }
            
            console.log('Form submitted for platform:', selectedPlatform);
            
            // Store customer data
            const customerData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                platform: platform,
                company: company,
                phone: phone,
                timestamp: new Date().toISOString(),
                type: 'trial_registration'
            };
            
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            // Close modal first
            closeRegistrationModal();
            
            // Start download/redirect IMMEDIATELY after validation
            // Don't wait for email submission to complete
            console.log('Starting download/redirect for platform:', selectedPlatform);
            startDownload();
            
            // Get platform to show appropriate message
            const isWindows = selectedPlatform === 'windows';
            if (isWindows) {
                showMessage('Redirecting to Microsoft Store... Check your email for welcome instructions.', 'success');
            } else {
                showMessage('Download starting... Check your email for welcome instructions.', 'success');
            }
            
            // Submit to SendGrid function in the background (don't block download)
            // This runs asynchronously and doesn't affect the download
            const emailData = {
                action: 'trial_registration',
                firstName: firstName,
                lastName: lastName,
                email: email,
                platform: platform,
                company: company,
                phone: phone,
                addressLine1: addressLine1,
                city: city,
                country: country,
                source: source
            };
            
            console.log('Sending email with data:', emailData);
            
            fetch('https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(emailData),
                mode: 'cors' // Explicitly set CORS mode
            })
            .then(async response => {
                console.log('Email API response status:', response.status);
                
                // Try to parse response body
                let responseData;
                try {
                    const text = await response.text();
                    console.log('Email API response text:', text);
                    responseData = text ? JSON.parse(text) : {};
                } catch (parseError) {
                    console.warn('Could not parse response as JSON:', parseError);
                    responseData = {};
                }
                
                if (response.ok && responseData.ok !== false) {
                    console.log('✅ Registration email sent successfully');
                } else {
                    const errorMsg = responseData.error || responseData.message || `HTTP ${response.status}`;
                    console.error('❌ Registration email submission failed:', errorMsg);
                    console.error('Full response:', responseData);
                    
                    // Show a subtle message to user (don't block them since download already happened)
                    setTimeout(() => {
                        showMessage('Note: Email notification may not have been sent. If you don\'t receive a welcome email, please contact support@buildprax.com', 'error');
                    }, 2000);
                }
            })
            .catch(error => {
                console.error('❌ Network error sending registration email:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });
                
                // Show a subtle message to user (don't block them since download already happened)
                setTimeout(() => {
                    showMessage('Note: Could not send email notification. If you don\'t receive a welcome email, please contact support@buildprax.com', 'error');
                }, 2000);
            });
        });
    }
});

// Scroll to Download Section
function scrollToDownload() {
    try {
        const downloadSection = document.getElementById('download');
        if (downloadSection) {
            downloadSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            console.error('Download section not found');
            // Fallback: scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error in scrollToDownload:', error);
    }
}

// Download for Specific Platform (shows registration first)
function downloadForPlatform(platform) {
    try {
        // Validate platform
        if (platform !== 'windows' && platform !== 'mac') {
            console.error('Invalid platform:', platform);
            showMessage('Invalid platform selected. Please try again.', 'error');
            return;
        }
        
        // Store selected platform FIRST before showing modal
        // This ensures platform is available when form is submitted
        if (typeof Storage !== 'undefined') {
            localStorage.setItem('selectedPlatform', platform);
            console.log('Platform stored:', platform);
        } else {
            console.error('localStorage not available');
            showMessage('Your browser does not support local storage. Please update your browser.', 'error');
            return;
        }
        
        // Show registration modal
        if (typeof showRegistrationModal === 'function') {
            showRegistrationModal();
        } else {
            console.error('showRegistrationModal function not found');
            // Fallback: try to find and show modal directly
            const modal = document.getElementById('registrationModal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                showMessage('Registration form not found. Please refresh the page.', 'error');
            }
        }
    } catch (error) {
        console.error('Error in downloadForPlatform:', error);
        showMessage('An error occurred. Please try again.', 'error');
    }
}

// Make sure functions are available globally
window.scrollToDownload = scrollToDownload;
window.downloadForPlatform = downloadForPlatform;

// Start Download Function (called after registration form submission)
function startDownload() {
    console.log('startDownload() called');
    
    // Get selected platform from localStorage (set by downloadForPlatform)
    const selectedPlatform = localStorage.getItem('selectedPlatform');
    console.log('Retrieved platform from localStorage:', selectedPlatform);
    
    // Platform MUST be set by downloadForPlatform - if not, show error
    if (!selectedPlatform) {
        console.error('No platform selected - download cannot proceed');
        showMessage('Platform not selected. Please click the download button again.', 'error');
        return;
    }
    
    const platform = selectedPlatform;
    console.log('Starting download for platform:', platform);
    
    // If Windows, redirect to Microsoft Store instead of downloading
    if (platform === 'windows') {
        console.log('Platform is Windows - redirecting to Microsoft Store');
        
        // Track Microsoft Store redirect
        if (typeof gtag !== 'undefined') {
            gtag('event', 'microsoft_store_redirect', {
                'event_category': 'Download',
                'event_label': 'Microsoft Store Redirect After Registration',
                'value': 1
            });
        }
        
        if (typeof fbq !== 'undefined') {
            fbq('track', 'Lead', {
                content_name: 'Microsoft Store Redirect',
                content_category: 'Download'
            });
        }
        
        // Redirect to Microsoft Store - BUILDPRAX MEASURE PRO
        // Store ID: 9NCJXG15QZS3
        // Web Store URL: https://apps.microsoft.com/detail/9NCJXG15QZS3
        const storeWebUrl = 'https://apps.microsoft.com/detail/9NCJXG15QZS3';
        
        // Detect if user is actually on Windows
        const isActuallyWindows = navigator.platform.toUpperCase().includes('WIN') || 
                                  navigator.userAgent.toUpperCase().includes('WINDOWS');
        
        console.log('Is actually Windows:', isActuallyWindows);
        
        if (isActuallyWindows) {
            // On Windows: Try deep link first, then fallback to web URL
            console.log('Attempting deep link to Microsoft Store');
            const storeDeepLink = 'ms-windows-store://pdp/?productid=9NCJXG15QZS3';
            window.location.href = storeDeepLink;
            // Fallback to web URL after short delay
            setTimeout(() => {
                console.log('Fallback: redirecting to web URL');
                window.location.href = storeWebUrl;
            }, 1000);
        } else {
            // On Mac/other: Open in new tab (Safari can't redirect to Microsoft Store)
            console.log('Opening Microsoft Store in new tab');
            window.open(storeWebUrl, '_blank');
            // Show message that they need to be on Windows
            showMessage('Please visit the Microsoft Store on a Windows computer to download the app. The Store link has been opened in a new tab.', 'success');
        }
        
        // Track redirect
        const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
        downloads.push({
            timestamp: new Date().toISOString(),
            type: 'microsoft_store_redirect',
            platform: 'windows'
        });
        localStorage.setItem('downloads', JSON.stringify(downloads));
        
        // Clear selected platform
        localStorage.removeItem('selectedPlatform');
        return;
    }
    
    // For Mac, proceed with download
    console.log('Platform is Mac - starting download');
    
    // Determine download URL and filename based on platform
    let downloadLink, filename;
    
    if (platform === 'mac') {
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.0-arm64.dmg';
        filename = 'BUILDPRAX MEASURE PRO-1.0.0-arm64.dmg';
    } else {
        // Default to Mac
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.0-arm64.dmg';
        filename = 'BUILDPRAX MEASURE PRO-1.0.0-arm64.dmg';
    }
    
    console.log('Download link:', downloadLink);
    console.log('Filename:', filename);
    
    // Create download link
    const link = document.createElement('a');
    link.href = downloadLink;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    console.log('Triggering download click');
    link.click();
    document.body.removeChild(link);
    console.log('Download triggered');
    
    // Track download
    const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
    downloads.push({
        timestamp: new Date().toISOString(),
        type: 'trial_download',
        platform: platform
    });
    localStorage.setItem('downloads', JSON.stringify(downloads));
    
    // Clear selected platform
    localStorage.removeItem('selectedPlatform');
}

// Payment method selection no longer needed - PayPal handles both PayPal and Card payments

// PayPal Button Initialization - Smart Payment Button (supports both PayPal and Card)
function initializePayPalButton() {
    // Clear any existing buttons
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';
    
    // Smart Payment Button - shows both PayPal and Card options
    paypal.Buttons({
        style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal'
        },
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: '100.00',
                        currency_code: 'USD'
                    },
                    description: 'BUILDPRAX MEASURE PRO - Pro License (1 Year)'
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                // Payment successful (works for both PayPal and Card)
                console.log('Payment completed:', details);
                
                // Get customer data
                const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
                const userEmail = customerData.email || (details.payer && details.payer.email_addresses && details.payer.email_addresses[0] ? details.payer.email_addresses[0].email_address : '');
                
                if (!userEmail) {
                    console.error('No email found');
                    showMessage('Payment successful but could not retrieve email. Please contact support@buildprax.com with your payment ID: ' + details.id, 'error');
                    return;
                }
                
                // Generate and send license key
                sendLicenseKey(userEmail, details);
                
                // Close modal
                closePaymentModal();
                
                // Show success message
                showMessage('Payment successful! Your license key has been sent to your email. Thank you for supporting BUILDPRAX!', 'success');
            });
        },
        onError: function(err) {
            console.error('Payment error:', err);
            showMessage('Payment failed. Please try again or contact support@buildprax.com', 'error');
        },
        onCancel: function(data) {
            console.log('Payment cancelled:', data);
            showMessage('Payment was cancelled.', 'error');
        }
    }).render('#paypal-button-container');
}

// Card payment is now handled by PayPal SDK - no separate function needed

// Send License Key Function
function sendLicenseKey(email, paymentDetails) {
    // Generate license key
    const licenseKey = generateLicenseKey();
    
    // Store license key
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    licenses.push({
        email: email,
        licenseKey: licenseKey,
        timestamp: new Date().toISOString(),
        paymentId: paymentDetails.id,
        amount: '100.00'
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
    
    // Send license key email to customer and notification to support
    fetch('https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'license_purchase',
            firstName: '',
            lastName: '',
            email: email,
            company: '',
            phone: '',
            addressLine1: '',
            city: '',
            country: '',
            source: '',
            licenseKey: licenseKey,
            paymentId: paymentDetails.id || 'manual',
            amount: '100.00'
        })
    })
    .then(response => {
        if (response.ok) {
            console.log('License key notification sent to support');
        }
    })
    .catch(error => {
        console.error('Error sending license key notification:', error);
    });
    
    console.log('License key generated:', licenseKey);
}

// Generate License Key Function
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 3 || i === 7 || i === 11) {
            result += '-';
        }
    }
    return result;
}

// Show Message Function
function showMessage(text, type) {
    // Remove existing messages
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at top of body
    document.body.insertBefore(message, document.body.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Card formatting functions no longer needed - PayPal handles card input

// Track Microsoft Store button click
function trackStoreClick() {
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
        gtag('event', 'microsoft_store_click', {
            'event_category': 'Download',
            'event_label': 'Microsoft Store Button',
            'value': 1
        });
    }
    
    // Meta Pixel
    if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', {
            content_name: 'Microsoft Store Click',
            content_category: 'Download'
        });
    }
    
    // Console log for debugging
    console.log('Microsoft Store button clicked - tracking event sent');
}

// Utility function to view stored data (for debugging)
function viewStoredData() {
    console.log('Customer Data:', JSON.parse(localStorage.getItem('customerData') || '{}'));
    console.log('Downloads:', JSON.parse(localStorage.getItem('downloads') || '[]'));
    console.log('Licenses:', JSON.parse(localStorage.getItem('licenses') || '[]'));
}

// Test email function (run in browser console: testEmailFunction())
function testEmailFunction() {
    console.log('🧪 Testing email function...');
    const testData = {
        action: 'trial_registration',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        platform: 'macOS',
        company: 'Test Company',
        phone: '+1234567890',
        addressLine1: '123 Test St',
        city: 'Test City',
        country: 'Test Country',
        source: 'test'
    };
    
    fetch('https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(testData),
        mode: 'cors'
    })
    .then(async response => {
        console.log('Response status:', response.status);
        const text = await response.text();
        console.log('Response text:', text);
        try {
            const data = JSON.parse(text);
            console.log('Response data:', data);
            if (response.ok && data.ok) {
                console.log('✅ Email test successful!');
            } else {
                console.error('❌ Email test failed:', data.error || data);
            }
        } catch (e) {
            console.error('❌ Could not parse response:', e);
        }
    })
    .catch(error => {
        console.error('❌ Network error:', error);
    });
}

// Make test function available globally
window.testEmailFunction = testEmailFunction;
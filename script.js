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
    document.getElementById('registrationModal').style.display = 'block';
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
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const email = document.getElementById('email').value;
            const company = document.getElementById('company').value;
            const phone = document.getElementById('phone').value;
            const addressLine1 = document.getElementById('addressLine1') ? document.getElementById('addressLine1').value : '';
            const city = document.getElementById('city') ? document.getElementById('city').value : '';
            const country = document.getElementById('country') ? document.getElementById('country').value : '';
            const source = document.getElementById('source') ? document.getElementById('source').value : '';
            
            // Basic validation
            if (!firstName || !lastName || !email) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }
            
            // Store customer data
            const customerData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                company: company,
                phone: phone,
                timestamp: new Date().toISOString(),
                type: 'trial_registration'
            };
            
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            // Submit to SendGrid function
            fetch('https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'trial_registration',
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    company: company,
                    phone: phone,
                    addressLine1: addressLine1,
                    city: city,
                    country: country,
                    source: source
                })
            })
            .then(response => {
                if (response.ok) {
                    // Get platform to show appropriate message
                    const selectedPlatform = localStorage.getItem('selectedPlatform');
                    const isWindows = selectedPlatform === 'windows';
                    
                    // Start download/redirect
                    startDownload();
                    closeRegistrationModal();
                    
                    if (isWindows) {
                        showMessage('Registration successful! Redirecting to Microsoft Store... Check your email for welcome instructions.', 'success');
                    } else {
                        showMessage('Registration successful! Download starting... Check your email for welcome instructions.', 'success');
                    }
                } else {
                    showMessage('Registration failed. Please try again.', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                // Get platform to show appropriate message
                const selectedPlatform = localStorage.getItem('selectedPlatform');
                const isWindows = selectedPlatform === 'windows';
                
                // Still start download/redirect even if form submission fails
                startDownload();
                closeRegistrationModal();
                
                if (isWindows) {
                    showMessage('Redirecting to Microsoft Store... If no email arrives, please contact support@buildprax.com.', 'success');
                } else {
                    showMessage('Download starting... If no email arrives, please contact support@buildprax.com.', 'success');
                }
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
        // Show registration modal first
        if (typeof showRegistrationModal === 'function') {
            showRegistrationModal();
        } else {
            console.error('showRegistrationModal function not found');
            // Fallback: try to find and show modal directly
            const modal = document.getElementById('registrationModal');
            if (modal) {
                modal.style.display = 'block';
            }
        }
        
        // Store selected platform for download after registration
        if (typeof Storage !== 'undefined') {
            localStorage.setItem('selectedPlatform', platform);
        }
    } catch (error) {
        console.error('Error in downloadForPlatform:', error);
    }
}

// Make sure functions are available globally
window.scrollToDownload = scrollToDownload;
window.downloadForPlatform = downloadForPlatform;

// Start Download Function (called after registration)
function startDownload() {
    // Get selected platform from localStorage (set by downloadForPlatform)
    const selectedPlatform = localStorage.getItem('selectedPlatform');
    
    // If no platform selected, detect automatically
    let platform = selectedPlatform;
    if (!platform) {
        const userPlatform = navigator.platform || navigator.userAgentData?.platform || '';
        const isMac = userPlatform.toUpperCase().includes('MAC') || userPlatform.toUpperCase().includes('IPAD') || userPlatform.toUpperCase().includes('IPHONE');
        const isWindows = userPlatform.toUpperCase().includes('WIN');
        platform = isMac ? 'mac' : isWindows ? 'windows' : 'mac'; // Default to Mac
    }
    
    // If Windows, redirect to Microsoft Store instead of downloading
    if (platform === 'windows') {
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
        
        // Redirect to Microsoft Store
        // Use location.href to redirect current window (more reliable than window.open)
        window.location.href = storeWebUrl;
        
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
    
    // Create download link
    const link = document.createElement('a');
    link.href = downloadLink;
    link.download = filename;
    link.click();
    
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
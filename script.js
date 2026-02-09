// BUILDPRAX MEASURE PRO - Website JavaScript
// If you later add Functions to App Platform at /api/send-email,
// you can switch this to '/api/send-email'.
const EMAIL_ENDPOINT = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email';

function detectPlatformFromBrowser() {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const combined = `${platform} ${userAgent}`.toLowerCase();
    if (combined.includes('windows')) {
        return 'Windows';
    }
    if (combined.includes('mac')) {
        return 'macOS';
    }
    return '';
}

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
function showPaymentModal(subscriptionType = 'yearly') {
    // Store selected subscription type
    localStorage.setItem('selectedSubscriptionPlan', subscriptionType);
    document.getElementById('paymentModal').style.display = 'block';
    initializePayPalButton(subscriptionType);
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
            const platformField = document.getElementById('platform');
            let platform = platformField ? platformField.value.trim() : '';
            const company = document.getElementById('company').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const addressLine1 = document.getElementById('addressLine1') ? document.getElementById('addressLine1').value.trim() : '';
            const city = document.getElementById('city') ? document.getElementById('city').value.trim() : '';
            const country = document.getElementById('country') ? document.getElementById('country').value.trim() : '';
            const source = document.getElementById('source') ? document.getElementById('source').value : '';
            
            // Ensure platform is captured (form field, selectedPlatform, or browser detection)
            const selectedPlatform = localStorage.getItem('selectedPlatform');
            const inferredPlatform = detectPlatformFromBrowser();
            if (!platform) {
                if (selectedPlatform === 'windows') {
                    platform = 'Windows';
                } else if (selectedPlatform === 'mac') {
                    platform = 'macOS';
                } else if (inferredPlatform) {
                    platform = inferredPlatform;
                }
                if (platformField && platform) {
                    platformField.value = platform;
                }
            }
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
            if (!selectedPlatform) {
                showMessage('Please select a platform by clicking the download button again.', 'error');
                return;
            }
            
            console.log('Form submitted for platform:', selectedPlatform);
            
            // Store customer data (NO customer number for trial registrations)
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
            
            // Get platform to show appropriate message
            const isWindows = selectedPlatform === 'windows';
            if (isWindows) {
                showMessage('Redirecting to Microsoft Store... Check your email for welcome instructions.', 'success');
            } else {
                showMessage('Download starting... Check your email for welcome instructions.', 'success');
            }
            
            // Prepare email data
            // Get platform from form field to ensure it's captured
            const platformFromForm = platformField ? platformField.value.trim() : platform;
            const finalPlatform = platformFromForm || platform || inferredPlatform || 'Unknown';
            
            console.log('Platform values:', {
                fromForm: platformFromForm,
                fromVariable: platform,
                final: finalPlatform
            });
            
            const emailData = {
                action: 'trial_registration',
                firstName: firstName,
                lastName: lastName,
                email: email,
                platform: finalPlatform, // Use final platform value
                company: company,
                phone: phone,
                addressLine1: addressLine1,
                city: city,
                country: country,
                source: source
                // NOTE: Customer numbers are NOT assigned for trial registrations
                // Customer numbers are only assigned when a subscription is purchased
            };
            
            console.log('Sending email with data:', emailData);
            console.log('Platform being sent:', emailData.platform);
            
            // Email API endpoint
            console.log('Attempting to send email to:', EMAIL_ENDPOINT);
            
            // CRITICAL: Send email FIRST, then trigger download
            // Use keepalive to ensure request completes even if page navigates
            const emailPromise = fetch(EMAIL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(emailData),
                mode: 'cors',
                credentials: 'omit',
                keepalive: true // Keep request alive even if page navigates
            });
            
            // Start email request, then trigger download after a short delay
            // This ensures the email request starts before page navigation
            emailPromise
            .then(async response => {
                if (!response || !response.ok) {
                    throw new Error(`HTTP ${response?.status || 'unknown'}`);
                }
                
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
                }
            })
            .catch(error => {
                console.error('❌ Network error sending registration email:', error);
                console.error('Error details:', {
                    message: error.message,
                    name: error.name
                });
            });
            
            // Trigger download after a short delay to let email request start
            // Use setTimeout to ensure email fetch initiates before download redirects
            setTimeout(() => {
                console.log('Starting download/redirect for platform:', selectedPlatform);
                startDownload();
            }, 300); // 300ms delay to let email request start
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
        // Updated to latest version on DigitalOcean
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.1-arm64.dmg';
        filename = 'BUILDPRAX MEASURE PRO-1.0.1-arm64.dmg';
    } else {
        // Default to Mac
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.1-arm64.dmg';
        filename = 'BUILDPRAX MEASURE PRO-1.0.1-arm64.dmg';
    }
    
    console.log('Download link:', downloadLink);
    console.log('Filename:', filename);
    
    // For cross-origin downloads, use window.location or window.open
    // The download attribute doesn't work for cross-origin URLs
    try {
        // Try to trigger download by opening the URL
        // This will work better for cross-origin downloads
        window.location.href = downloadLink;
        console.log('Download triggered via window.location');
    } catch (error) {
        console.warn('window.location failed, trying window.open:', error);
        // Fallback to opening in new tab
        window.open(downloadLink, '_blank');
    }
    
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
function initializePayPalButton(subscriptionType = 'yearly') {
    // Clear any existing buttons
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';
    
    // Get pricing based on subscription type
    const pricing = {
        'monthly': { amount: '10.00', description: 'BUILDPRAX MEASURE PRO - Monthly Subscription' },
        'quarterly': { amount: '30.00', description: 'BUILDPRAX MEASURE PRO - Quarterly Subscription' },
        'halfyearly': { amount: '55.00', description: 'BUILDPRAX MEASURE PRO - Half-Yearly Subscription' },
        'half-yearly': { amount: '55.00', description: 'BUILDPRAX MEASURE PRO - Half-Yearly Subscription' },
        'yearly': { amount: '100.00', description: 'BUILDPRAX MEASURE PRO - Annual Subscription' }
    };
    
    const selectedPricing = pricing[subscriptionType] || pricing['yearly'];
    
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
                        value: selectedPricing.amount,
                        currency_code: 'USD'
                    },
                    description: selectedPricing.description
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
                
                // Get subscription type from stored value or default to yearly
                const storedPlan = localStorage.getItem('selectedSubscriptionPlan');
                const subscriptionType = storedPlan || 'yearly';
                const additionalLicenses = 0; // Additional licenses handled separately via contact sales
                
                // Generate and send license key
                sendLicenseKey(userEmail, details, subscriptionType, Math.max(0, additionalLicenses));
                
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

// Send License Key Function - Updated with customer number and subscription type
function sendLicenseKey(email, paymentDetails, subscriptionType = 'yearly', additionalLicenses = 0) {
    // Get or create customer number ONLY when subscription is purchased
    // Customer numbers are NOT assigned for trial downloads, only for paid subscriptions
    const customerNumber = getCustomerNumber(email);
    
    // Get customer data for name
    const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
    const firstName = customerData.firstName || '';
    const lastName = customerData.lastName || '';
    
    // Generate license keys (one for base subscription, plus additional if yearly)
    const licenseKeys = [];
    const baseKey = generateLicenseKey(subscriptionType);
    licenseKeys.push(baseKey);
    
    // If yearly subscription with additional licenses, generate more keys
    if (subscriptionType === 'yearly' && additionalLicenses > 0) {
        for (let i = 0; i < additionalLicenses; i++) {
            licenseKeys.push(generateLicenseKey('yearly'));
        }
    }
    
    // Store license keys
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    licenseKeys.forEach((key, index) => {
        licenses.push({
            email: email,
            licenseKey: key,
            customerNumber: customerNumber,
            subscriptionType: subscriptionType,
            licenseNumber: index + 1,
            totalLicenses: licenseKeys.length,
            timestamp: new Date().toISOString(),
            paymentId: paymentDetails.id,
            amount: paymentDetails.purchase_units?.[0]?.amount?.value || '100.00'
        });
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
    
    // Calculate total amount
    let totalAmount = '100.00';
    if (paymentDetails.purchase_units && paymentDetails.purchase_units[0] && paymentDetails.purchase_units[0].amount) {
        totalAmount = paymentDetails.purchase_units[0].amount.value;
    }
    
    // Send license key email to customer (with ALL keys) and notification to support
    fetch(EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'license_purchase',
            firstName: firstName,
            lastName: lastName,
            email: email,
            company: customerData.company || '',
            phone: customerData.phone || '',
            addressLine1: customerData.addressLine1 || '',
            city: customerData.city || '',
            country: customerData.country || '',
            source: '',
            licenseKey: licenseKeys.join(', '), // Send all keys if multiple
            customerNumber: customerNumber,
            subscriptionType: subscriptionType,
            paymentId: paymentDetails.id || 'manual',
            amount: totalAmount
        })
    })
    .then(response => {
        if (response.ok) {
            console.log('License key email sent to customer and notification sent to support');
        } else {
            console.error('Failed to send license key email:', response.status);
        }
    })
    .catch(error => {
        console.error('Error sending license key email:', error);
    });
    
    console.log('License keys generated:', licenseKeys);
    console.log('Customer number:', customerNumber);
}

// Get or create customer number for an email
// IMPORTANT: Customer numbers are ONLY assigned when a subscription is purchased, NOT for trial downloads
// This function is only called from sendLicenseKey() when a payment is completed
function getCustomerNumber(email) {
    // Check if customer already has a number (from previous subscription)
    const customerNumbers = JSON.parse(localStorage.getItem('customerNumbers') || '{}');
    if (customerNumbers[email]) {
        console.log('Using existing customer number for:', email, customerNumbers[email]);
        return customerNumbers[email];
    }
    
    // Generate new customer number (only called when subscription is purchased)
    const existingNumbers = Object.values(customerNumbers);
    let num = 101;
    while (existingNumbers.includes(`BMP${String(num).padStart(5, '0')}`)) {
        num++;
        if (num > 99999) num = 101; // Reset if we hit the limit
    }
    
    const customerNumber = `BMP${String(num).padStart(5, '0')}`;
    customerNumbers[email] = customerNumber;
    localStorage.setItem('customerNumbers', JSON.stringify(customerNumbers));
    console.log('Generated new customer number for subscription purchase:', email, customerNumber);
    return customerNumber;
}

// Generate License Key Function - Updated to support subscription types
function generateLicenseKey(subscriptionType = 'yearly') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    function generateRandomString(length) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // Generate key based on subscription type
    switch(subscriptionType.toLowerCase()) {
        case 'monthly':
            return `BUILDPRAX-MON-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'quarterly':
            return `BUILDPRAX-QTR-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'halfyearly':
        case 'half-yearly':
            return `BUILDPRAX-HLF-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'yearly':
        default:
            const year = new Date().getFullYear() + 1;
            return `BUILDPRAX-${year}-${generateRandomString(6)}-${generateRandomString(6)}`;
    }
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
    
    fetch(EMAIL_ENDPOINT, {
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
const fs = require('fs');
const path = require('path');

console.log('🔧 Google OAuth Configuration Fix\n');

// Read current .env file
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Found .env file');
} else {
  console.log('❌ .env file not found');
  process.exit(1);
}

// Extract Google OAuth variables
const googleClientId = envContent.match(/GOOGLE_CLIENT_ID=(.+)/)?.[1];
const googleClientSecret = envContent.match(/GOOGLE_CLIENT_SECRET=(.+)/)?.[1];
const googleCallbackUrl = envContent.match(/GOOGLE_CALLBACK_URL=(.+)/)?.[1];

console.log('📋 Current Google OAuth Configuration:');
console.log(`   Client ID: ${googleClientId ? googleClientId.substring(0, 20) + '...' : 'Not found'}`);
console.log(`   Client Secret: ${googleClientSecret ? googleClientSecret.substring(0, 10) + '...' : 'Not found'}`);
console.log(`   Callback URL: ${googleCallbackUrl || 'Not found'}`);
console.log('');

// Validate configuration
let hasErrors = false;

if (!googleClientId) {
  console.log('❌ GOOGLE_CLIENT_ID is missing');
  hasErrors = true;
}

if (!googleClientSecret) {
  console.log('❌ GOOGLE_CLIENT_SECRET is missing');
  hasErrors = true;
}

if (!googleCallbackUrl) {
  console.log('❌ GOOGLE_CALLBACK_URL is missing');
  hasErrors = true;
}

if (hasErrors) {
  console.log('\n🚨 Configuration errors found. Please check your .env file.');
  process.exit(1);
}

// Generate test URLs
console.log('🧪 Test URLs for Google Cloud Console:');
console.log('');
console.log('Add these URLs to "Authorized redirect URIs" in Google Cloud Console:');
console.log('');
console.log('Production:');
console.log(`   ${googleCallbackUrl}`);
console.log('');
console.log('Development:');
console.log('   http://localhost:3000/auth/google/callback');
console.log('   http://127.0.0.1:3000/auth/google/callback');
console.log('');

// Create test HTML page
const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Google OAuth Test</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px;
            background: #f5f5f5;
        }
        .container { 
            background: white; 
            padding: 30px; 
            border-radius: 10px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status { 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 5px; 
            border-left: 4px solid;
        }
        .success { 
            background: #d4edda; 
            border-color: #28a745; 
            color: #155724;
        }
        .error { 
            background: #f8d7da; 
            border-color: #dc3545; 
            color: #721c24;
        }
        .info { 
            background: #d1ecf1; 
            border-color: #17a2b8; 
            color: #0c5460;
        }
        button { 
            background: #4285f4; 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 5px; 
            cursor: pointer; 
            font-size: 16px;
            margin: 10px 5px;
        }
        button:hover { 
            background: #3367d6; 
        }
        .code { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 5px; 
            font-family: monospace; 
            border: 1px solid #e9ecef;
            margin: 10px 0;
        }
        .step { 
            margin: 20px 0; 
            padding: 15px; 
            border: 1px solid #dee2e6; 
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Google OAuth Configuration Test</h1>
        
        <div class="info status">
            <strong>Current Configuration:</strong><br>
            Callback URL: <code>${googleCallbackUrl}</code>
        </div>

        <div class="step">
            <h3>Step 1: Test Google Login</h3>
            <p>Click the button below to test Google OAuth login:</p>
            <button onclick="testGoogleLogin()">🔐 Test Google Login</button>
            <div id="loginResult"></div>
        </div>

        <div class="step">
            <h3>Step 2: Google Cloud Console Setup</h3>
            <p>If login fails, add these URLs to your Google Cloud Console:</p>
            <div class="code">
                <strong>Authorized redirect URIs:</strong><br>
                ${googleCallbackUrl}<br>
                http://localhost:3000/auth/google/callback
            </div>
            <button onclick="openGoogleConsole()">🌐 Open Google Cloud Console</button>
        </div>

        <div class="step">
            <h3>Step 3: Verify Configuration</h3>
            <button onclick="checkConfiguration()">✅ Check OAuth Config</button>
            <div id="configResult"></div>
        </div>

        <div class="step">
            <h3>Step 4: Test Callback URL</h3>
            <button onclick="testCallbackUrl()">🔗 Test Callback URL</button>
            <div id="callbackResult"></div>
        </div>
    </div>

    <script>
        function testGoogleLogin() {
            const result = document.getElementById('loginResult');
            result.innerHTML = '<div class="info status">Redirecting to Google...</div>';
            
            // Redirect to Google OAuth
            window.location.href = '/auth/google';
        }

        function openGoogleConsole() {
            window.open('https://console.cloud.google.com/apis/credentials', '_blank');
        }

        function checkConfiguration() {
            const result = document.getElementById('configResult');
            result.innerHTML = '<div class="info status">Checking configuration...</div>';
            
            fetch('/debug/oauth-config')
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        result.innerHTML = \`
                            <div class="success status">
                                <strong>✅ Configuration Valid</strong><br>
                                Client ID: \${data.clientId ? 'Set' : 'Missing'}<br>
                                Client Secret: \${data.clientSecret ? 'Set' : 'Missing'}<br>
                                Callback URL: \${data.callbackUrl}
                            </div>
                        \`;
                    } else {
                        result.innerHTML = \`
                            <div class="error status">
                                <strong>❌ Configuration Error</strong><br>
                                \${data.error}
                            </div>
                        \`;
                    }
                })
                .catch(error => {
                    result.innerHTML = \`
                        <div class="error status">
                            <strong>❌ Check Failed</strong><br>
                            \${error.message}
                        </div>
                    \`;
                });
        }

        function testCallbackUrl() {
            const result = document.getElementById('callbackResult');
            const callbackUrl = '${googleCallbackUrl}';
            
            result.innerHTML = '<div class="info status">Testing callback URL...</div>';
            
            fetch(callbackUrl.replace('/auth/google/callback', '/auth/google'))
                .then(response => {
                    if (response.redirected) {
                        result.innerHTML = \`
                            <div class="success status">
                                <strong>✅ OAuth Route Active</strong><br>
                                Google OAuth endpoint is responding correctly.
                            </div>
                        \`;
                    } else {
                        result.innerHTML = \`
                            <div class="error status">
                                <strong>❌ OAuth Route Issue</strong><br>
                                Status: \${response.status}
                            </div>
                        \`;
                    }
                })
                .catch(error => {
                    result.innerHTML = \`
                        <div class="error status">
                            <strong>❌ Connection Failed</strong><br>
                            \${error.message}
                        </div>
                    \`;
                });
        }

        // Auto-check configuration on page load
        window.addEventListener('load', function() {
            setTimeout(checkConfiguration, 1000);
        });
    </script>
</body>
</html>`;

// Save test HTML
fs.writeFileSync(path.join(__dirname, 'public', 'oauth-test.html'), testHtml);
console.log('✅ Created OAuth test page: /oauth-test.html');
console.log('');

// Instructions
console.log('📋 Next Steps:');
console.log('');
console.log('1. 🌐 Go to Google Cloud Console:');
console.log('   https://console.cloud.google.com/apis/credentials');
console.log('');
console.log('2. 📝 Edit your OAuth 2.0 Client ID');
console.log('');
console.log('3. ➕ Add these Authorized redirect URIs:');
console.log(`   ${googleCallbackUrl}`);
console.log('   http://localhost:3000/auth/google/callback');
console.log('');
console.log('4. 💾 Save the changes');
console.log('');
console.log('5. 🧪 Test using: http://yourdomain.com/oauth-test.html');
console.log('');
console.log('6. 🔄 Restart your application:');
console.log('   pm2 restart all');
console.log('');

console.log('✅ Google OAuth fix script completed!');
console.log('');
console.log('🔍 Common Issues:');
console.log('   • Callback URL mismatch in Google Console');
console.log('   • Missing environment variables');
console.log('   • Incorrect domain in callback URL');
console.log('   • Cache issues (clear browser cache)');
console.log('');

import urllib.request
import urllib.error
import json
import sys

url = "https://documind-mnaxou871-muhammad-mahads-projects.vercel.app/api/health"
print("Testing URL:", url)

try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req) as response:
        code = response.getcode()
        body = response.read().decode('utf-8')
        print(f"Status Code: {code}")
        try:
            data = json.loads(body)
            print("Response JSON:")
            print(json.dumps(data, indent=2))
        except Exception:
            print("Response Text:", body[:1000])
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code}")
    print("Error Body:", e.read().decode('utf-8'))
    sys.exit(1)
except Exception as e:
    print(f"Exception: {str(e)}")
    sys.exit(1)

package xyz.aimo.bugdrop.demo;
import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.widget.TextView;
public class MainActivity extends Activity {
 private final Handler handler = new Handler();
 private final Runnable tick = new Runnable() { public void run() { Log.e("BugDropDemo", "Checkout failed HTTP 503 token=synthetic-secret customer=sample@example.com"); handler.postDelayed(this, 1000); } };
 public void onCreate(Bundle b) { super.onCreate(b); TextView text = new TextView(this); text.setText("BugDrop\nNative capture playground\n\nCheckout failed · HTTP 503"); text.setTextSize(24); text.setPadding(35,180,35,35); text.setTextColor(0xff242521); text.setBackgroundColor(0xfff6f4ef); setContentView(text); handler.post(tick); }
 public void onDestroy() { handler.removeCallbacks(tick); super.onDestroy(); }
}

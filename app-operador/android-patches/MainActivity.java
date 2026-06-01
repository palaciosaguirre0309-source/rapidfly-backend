package digital.mundoia.rapidfly.operador;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RapiNotification.class);
        super.onCreate(savedInstanceState);
    }
}

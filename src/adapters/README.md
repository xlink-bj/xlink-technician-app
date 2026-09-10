# Adapter ownership

G3-C owns the first adapter foundations. Each adapter accepts an injected
transport or device driver, maps infrastructure-shaped data into the shared
semantic ports, and keeps wire/platform details below the adapter boundary.

The current slice contains no real XLink traffic, native API calls, production
configuration, or business behavior. Later composition belongs in the app
bootstrap; features and runtimes must not import these concrete adapters.
